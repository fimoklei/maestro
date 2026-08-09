// Connects the central inventory: a local path offline, a GitHub URL by
// cloning it first. Every check but the clone itself reads local git config.
// Errors are typed and path-free (security.md).
import { join } from "node:path";
import { parseGitOrigin } from "../deploy/git-origin";
import type { ConfigStore } from "../registry/config-store";
import type { FileSystemPort } from "../registry/file-system";
import { type RepoPathError, validateRepoPath } from "../registry/repo-path";
import type { CloneRepositoryPort } from "./clone-repository";
import {
  type ConnectInputError,
  classifyConnectInput,
  cloneDestination,
} from "./connect-input";
import { HARNESS_MANIFEST } from "./harness-layout";

export type ConnectInventoryError =
  | RepoPathError
  | ConnectInputError
  | "clone-failed"
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
  private readonly homeRoot: () => string;
  private readonly cloneRepository: CloneRepositoryPort;

  constructor(deps: {
    fs: FileSystemPort;
    store: ConfigStore;
    originUrl: (path: string) => Promise<string | null>;
    defaultBranch: (path: string) => Promise<string | null>;
    // The same ceiling browsing uses, so a proposed clone destination sits
    // where the picker can reach it (#554).
    homeRoot: () => string;
    clone: CloneRepositoryPort;
  }) {
    this.fs = deps.fs;
    this.store = deps.store;
    this.originUrl = deps.originUrl;
    this.defaultBranch = deps.defaultBranch;
    this.homeRoot = deps.homeRoot;
    this.cloneRepository = deps.clone;
  }

  async connect(input: string): Promise<ConnectInventoryResult> {
    const route = classifyConnectInput(input);
    if (!route.ok) {
      return { ok: false, error: route.error };
    }
    if (route.kind === "path") {
      return this.connectDirectory(input, "found");
    }

    const destination = cloneDestination(this.homeRoot(), route.repoName);
    if (
      (await this.cloneRepository.clone(route.url, destination)) !== "cloned"
    ) {
      return { ok: false, error: "clone-failed" };
    }
    // A clone that lands but does not connect stays on disk: it is a real
    // repository, and deleting one is never Maestro's to do (#498).
    return this.connectDirectory(destination, "joined");
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
