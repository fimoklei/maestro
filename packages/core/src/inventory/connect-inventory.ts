// Connects the central inventory: a local path offline, a GitHub URL by
// cloning it first. Errors are typed and path-free.
import { join } from "node:path";
import { parseGitOrigin } from "../deploy/git-origin";
import { isWithinRoot } from "../filesystem/path-containment";
import type { ConfigStore } from "../registry/config-store";
import type { FileSystemPort } from "../registry/file-system";
import {
  normalizeRepoPathInput,
  type RepoPathError,
  validateRepoPath,
} from "../registry/repo-path";
import type { CloneFailure } from "./classify-clone-failure";
import { classifyCloneDestination } from "./clone-destination";
import type { CloneRepositoryPort } from "./clone-repository";
import {
  type ConnectInputError,
  classifyConnectInput,
  cloneDestination,
} from "./connect-input";
import { HARNESS_MANIFEST } from "./harness-layout";
import type { HeadProbe } from "./head-commit";
import type { ScaffoldOffers } from "./scaffold-offers";

export type ConnectInventoryError =
  | RepoPathError
  | ConnectInputError
  | CloneFailure
  | "invalid-parent"
  | "destination-occupied"
  | "destination-partial-clone"
  | "clone-in-progress"
  | "not-an-inventory"
  | "not-a-folder-path"
  | "scaffoldable"
  | "no-usable-origin"
  | "no-default-branch";

export type ConnectOutcome = "found" | "joined" | "scaffolded";

// `scaffoldable` carries its path: a clone sits where the user never typed.
export type ConnectInventoryResult =
  | { ok: true; outcome: ConnectOutcome; inventoryPath: string }
  | { ok: false; error: "scaffoldable"; scaffoldPath: string }
  | { ok: false; error: Exclude<ConnectInventoryError, "scaffoldable"> };

export class ConnectInventory {
  private readonly fs: FileSystemPort;
  private readonly store: ConfigStore;
  private readonly originUrl: (path: string) => Promise<string | null>;
  private readonly defaultBranch: (path: string) => Promise<string | null>;
  private readonly isRepositoryRoot: (path: string) => Promise<boolean>;
  private readonly probeHead: (path: string) => Promise<HeadProbe>;
  private readonly homeRoot: () => string;
  private readonly cloneRepository: CloneRepositoryPort;
  private readonly offers: ScaffoldOffers;
  // A second request would read an in-flight clone as an interrupted one (#555).
  private readonly cloning = new Set<string>();

  constructor(deps: {
    fs: FileSystemPort;
    store: ConfigStore;
    originUrl: (path: string) => Promise<string | null>;
    defaultBranch: (path: string) => Promise<string | null>;
    // Without it a subdirectory would read as a clone (#556).
    isRepositoryRoot: (path: string) => Promise<boolean>;
    probeHead: (path: string) => Promise<HeadProbe>;
    // The ceiling a clone destination must sit under.
    homeRoot: () => string;
    clone: CloneRepositoryPort;
    // The scaffold acts only on a path recorded here.
    offers: ScaffoldOffers;
  }) {
    this.fs = deps.fs;
    this.store = deps.store;
    this.originUrl = deps.originUrl;
    this.defaultBranch = deps.defaultBranch;
    this.isRepositoryRoot = deps.isRepositoryRoot;
    this.probeHead = deps.probeHead;
    this.homeRoot = deps.homeRoot;
    this.cloneRepository = deps.clone;
    this.offers = deps.offers;
  }

  // `parent` is the folder a clone lands *in*; the child is the repository's
  // name. `localOnly` refuses every remote address (#995).
  async connect(
    input: string,
    options: { parent?: string; localOnly?: boolean } = {},
  ): Promise<ConnectInventoryResult> {
    const route = classifyConnectInput(input);
    if (options.localOnly && !(route.ok && route.kind === "path")) {
      return { ok: false, error: "not-a-folder-path" };
    }
    if (!route.ok) {
      return { ok: false, error: route.error };
    }
    if (route.kind === "path") {
      return this.connectDirectory(input, "found");
    }

    const parent = await this.resolveParent(options.parent);
    if (parent === null) {
      return { ok: false, error: "invalid-parent" };
    }

    const destination = cloneDestination(parent, route.repoName);
    if (this.cloning.has(destination)) {
      return { ok: false, error: "clone-in-progress" };
    }
    this.cloning.add(destination);
    try {
      return await this.cloneInto(destination, route);
    } finally {
      this.cloning.delete(destination);
    }
  }

  private async cloneInto(
    destination: string,
    route: { url: string; ownerRepo: string },
  ): Promise<ConnectInventoryResult> {
    const state = await classifyCloneDestination(destination, route.ownerRepo, {
      fs: this.fs,
      originUrl: this.originUrl,
      probeHead: this.probeHead,
    });
    if (state === "occupied") {
      return { ok: false, error: "destination-occupied" };
    }
    if (state === "partial-clone") {
      return { ok: false, error: "destination-partial-clone" };
    }
    if (state === "same-origin") {
      return this.connectDirectory(destination, "found");
    }

    const cloned = await this.cloneRepository.clone(route.url, destination);
    if (cloned !== "cloned") {
      return { ok: false, error: cloned };
    }
    // A clone that fails to connect stays on disk: never delete a repo (#498).
    return this.connectDirectory(destination, "joined");
  }

  // Untrusted input: refuse lexically outside home before touching disk,
  // resolve, then check containment again against the canonical home.
  private async resolveParent(chosen?: string): Promise<string | null> {
    const rawHome = this.homeRoot();
    // Both count: they differ under a symlinked prefix (macOS /var).
    const home = await this.fs.realpath(rawHome).catch(() => rawHome);
    if (chosen === undefined) {
      return home;
    }
    const normalized = normalizeRepoPathInput(chosen);
    if (
      !normalized.ok ||
      (!isWithinRoot(normalized.path, home) &&
        !isWithinRoot(normalized.path, rawHome))
    ) {
      return null;
    }
    const validated = await validateRepoPath(normalized.path, this.fs);
    if (!validated.ok) {
      return null;
    }
    // A symlink lexically inside home but resolving outside is caught here.
    return isWithinRoot(validated.path, home) ? validated.path : null;
  }

  private async connectDirectory(
    input: string,
    outcome: ConnectOutcome,
  ): Promise<ConnectInventoryResult> {
    const validated = await validateRepoPath(input, this.fs);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }

    const originUrl = await this.originUrl(validated.path);
    const origin = originUrl === null ? null : parseGitOrigin(originUrl);

    // A real file: a directory or symlink with the manifest's name is refused.
    const manifest = join(validated.path, HARNESS_MANIFEST);
    if (!(await this.fs.isFileEntry(manifest))) {
      if (origin === null || !(await this.isRepositoryRoot(validated.path))) {
        return { ok: false, error: "not-an-inventory" };
      }
      this.offers.offer(validated.path);
      return { ok: false, error: "scaffoldable", scaffoldPath: validated.path };
    }

    if (origin === null) {
      return { ok: false, error: "no-usable-origin" };
    }

    if ((await this.defaultBranch(validated.path)) === null) {
      return { ok: false, error: "no-default-branch" };
    }

    await this.store.update((config) => ({
      config: { ...config, inventoryPath: validated.path },
    }));
    return { ok: true, outcome, inventoryPath: validated.path };
  }
}
