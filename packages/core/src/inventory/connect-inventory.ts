// Connects the central inventory offline: validates a user-pasted absolute path
// to an existing local agent-harness clone and persists it as inventoryPath via
// the ConfigStore. Mirrors the consuming-repo registry's path model (realpath +
// exists + is-a-directory, see .claude/rules/security.md) and adds one check —
// a skills/ subdirectory — so the path is plausibly an inventory. Offline only:
// no git clone (deferred per the job map). Errors are typed and path-free.
import { join } from "node:path";
import type { ConfigStore } from "../registry/config-store";
import type { FileSystemPort } from "../registry/file-system";
import { type RepoPathError, validateRepoPath } from "../registry/repo-path";

export type ConnectInventoryError = RepoPathError | "not-an-inventory";

export type ConnectInventoryResult =
  | { ok: true; inventoryPath: string }
  | { ok: false; error: ConnectInventoryError };

export class ConnectInventory {
  private readonly fs: FileSystemPort;
  private readonly store: ConfigStore;

  constructor(deps: { fs: FileSystemPort; store: ConfigStore }) {
    this.fs = deps.fs;
    this.store = deps.store;
  }

  async connect(input: string): Promise<ConnectInventoryResult> {
    const validated = await validateRepoPath(input, this.fs);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }

    if (!(await this.fs.isDirectory(join(validated.path, "skills")))) {
      return { ok: false, error: "not-an-inventory" };
    }

    const config = await this.store.read();
    await this.store.write({ ...config, inventoryPath: validated.path });
    return { ok: true, inventoryPath: validated.path };
  }
}
