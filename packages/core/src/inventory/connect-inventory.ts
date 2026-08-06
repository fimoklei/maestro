// Connects the central inventory offline — the origin check reads local git
// config, never the network. Errors are typed and path-free (security.md).
import { join } from "node:path";
import { parseGitOrigin } from "../deploy/git-origin";
import type { ConfigStore } from "../registry/config-store";
import type { FileSystemPort } from "../registry/file-system";
import { type RepoPathError, validateRepoPath } from "../registry/repo-path";
import { HARNESS_MANIFEST } from "./harness-layout";

export type ConnectInventoryError =
  | RepoPathError
  | "not-an-inventory"
  | "no-usable-origin"
  | "no-default-branch";

// What connecting did, named by the use case rather than inferred at the edge.
// The local-path route is the only one that exists today; the join and scaffold
// routes add their own outcomes to this union (#498).
export type ConnectOutcome = "found";

export type ConnectInventoryResult =
  | { ok: true; outcome: ConnectOutcome; inventoryPath: string }
  | { ok: false; error: ConnectInventoryError };

export class ConnectInventory {
  private readonly fs: FileSystemPort;
  private readonly store: ConfigStore;
  private readonly originUrl: (path: string) => Promise<string | null>;
  private readonly defaultBranch: (path: string) => Promise<string | null>;

  constructor(deps: {
    fs: FileSystemPort;
    store: ConfigStore;
    originUrl: (path: string) => Promise<string | null>;
    defaultBranch: (path: string) => Promise<string | null>;
  }) {
    this.fs = deps.fs;
    this.store = deps.store;
    this.originUrl = deps.originUrl;
    this.defaultBranch = deps.defaultBranch;
  }

  async connect(input: string): Promise<ConnectInventoryResult> {
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
    return { ok: true, outcome: "found", inventoryPath: validated.path };
  }
}
