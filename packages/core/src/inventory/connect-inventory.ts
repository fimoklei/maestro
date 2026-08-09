// Connects the central inventory: a local path offline, a GitHub URL by
// cloning it first. Every check but the clone itself reads local git config.
// Errors are typed and path-free (security.md).
import { join } from "node:path";
import { parseGitOrigin } from "../deploy/git-origin";
import { isWithinRoot } from "../filesystem/browse-path";
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

export type ConnectInventoryError =
  | RepoPathError
  | ConnectInputError
  | CloneFailure
  | "invalid-parent"
  | "destination-occupied"
  | "destination-partial-clone"
  | "clone-in-progress"
  | "not-an-inventory"
  | "no-usable-origin"
  | "no-default-branch";

// What connecting did, named by the use case rather than inferred at the edge.
// The scaffold route adds its own outcome to this union (#498).
export type ConnectOutcome = "found" | "joined";

export type ConnectInventoryResult =
  | { ok: true; outcome: ConnectOutcome; inventoryPath: string }
  | { ok: false; error: ConnectInventoryError };

export class ConnectInventory {
  private readonly fs: FileSystemPort;
  private readonly store: ConfigStore;
  private readonly originUrl: (path: string) => Promise<string | null>;
  private readonly defaultBranch: (path: string) => Promise<string | null>;
  private readonly probeHead: (path: string) => Promise<HeadProbe>;
  private readonly homeRoot: () => string;
  private readonly cloneRepository: CloneRepositoryPort;
  // Destinations this instance is cloning into right now. A second request
  // would read the first one's half-written clone as an interrupted one and
  // tell the user to delete it (#555).
  private readonly cloning = new Set<string>();

  constructor(deps: {
    fs: FileSystemPort;
    store: ConfigStore;
    originUrl: (path: string) => Promise<string | null>;
    defaultBranch: (path: string) => Promise<string | null>;
    // Separates a usable clone already on disk from the shell an interrupted
    // one leaves behind (#555).
    probeHead: (path: string) => Promise<HeadProbe>;
    // The same ceiling browsing uses, so a proposed clone destination sits
    // where the picker can reach it (#554).
    homeRoot: () => string;
    clone: CloneRepositoryPort;
  }) {
    this.fs = deps.fs;
    this.store = deps.store;
    this.originUrl = deps.originUrl;
    this.defaultBranch = deps.defaultBranch;
    this.probeHead = deps.probeHead;
    this.homeRoot = deps.homeRoot;
    this.cloneRepository = deps.clone;
  }

  // `parent` is the folder a clone lands *in*; the child folder is always the
  // repository's own name. Modelled that way so the destination itself is
  // never put through existing-path validation (#555).
  async connect(
    input: string,
    options: { parent?: string } = {},
  ): Promise<ConnectInventoryResult> {
    const route = classifyConnectInput(input);
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
    // A copy of this very repository is what the user was about to make, so it
    // is connected rather than duplicated. Nothing on disk is touched.
    if (state === "same-origin") {
      return this.connectDirectory(destination, "found");
    }

    const cloned = await this.cloneRepository.clone(route.url, destination);
    if (cloned !== "cloned") {
      return { ok: false, error: cloned };
    }
    // A clone that lands but does not connect stays on disk: it is a real
    // repository, and deleting one is never Maestro's to do (#498).
    return this.connectDirectory(destination, "joined");
  }

  // The chosen parent crosses a trust boundary and is where a clone gets
  // written, so it runs the picker's own order: refuse lexically outside the
  // home ceiling before touching disk, resolve, then check containment again
  // against the canonical ceiling (ADR-0009, security.md).
  private async resolveParent(chosen?: string): Promise<string | null> {
    const rawHome = this.homeRoot();
    // Raw and resolved home both count: they differ under a symlinked prefix
    // (macOS /var -> /private/var).
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

    // A real file, so a directory or a symlink wearing the manifest's name is
    // refused here exactly as the picker refuses it (#148).
    const manifest = join(validated.path, HARNESS_MANIFEST);
    if (!(await this.fs.isFileEntry(manifest))) {
      return { ok: false, error: "not-an-inventory" };
    }

    const originUrl = await this.originUrl(validated.path);
    if (originUrl === null || parseGitOrigin(originUrl) === null) {
      return { ok: false, error: "no-usable-origin" };
    }

    // A precondition, not a stored field: every later authoring step reads the
    // branch itself, and a Harness that cannot name one would only fail there.
    if ((await this.defaultBranch(validated.path)) === null) {
      return { ok: false, error: "no-default-branch" };
    }

    await this.store.update((config) => ({
      config: { ...config, inventoryPath: validated.path },
    }));
    return { ok: true, outcome, inventoryPath: validated.path };
  }
}
