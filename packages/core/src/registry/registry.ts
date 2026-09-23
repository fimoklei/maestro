// The consuming-repo registry, and the path allowlist every path-taking
// endpoint checks against (security.md).
import { join } from "node:path";
import type { ConfigStore, MaestroConfig } from "./config-store";
import type { FileSystemPort } from "./file-system";
import { type RepoPathError, validateRepoPath } from "./repo-path";

export type RegisteredRepo = { path: string };

/** What the registry can tell about a registered folder without apm. */
export type RepoStatus = "ready" | "folder-missing" | "not-a-git-repo";

export type RegisterError =
  | RepoPathError
  | "central-inventory"
  | "not-a-git-repo"
  | "already-registered";

type CheckResult =
  | { ok: true; path: string }
  | { ok: false; error: RegisterError };

type RegisterResult =
  | { ok: true; repos: RegisteredRepo[] }
  | { ok: false; error: RegisterError };

type UnregisterResult =
  | { ok: true; repos: RegisteredRepo[] }
  | { ok: false; error: "not-registered" };

export class Registry {
  private readonly fs: FileSystemPort;
  private readonly store: ConfigStore;
  private readonly resolveCentralInventoryPath: (
    config: MaestroConfig,
  ) => Promise<string | undefined> | string | undefined;
  constructor(deps: {
    fs: FileSystemPort;
    store: ConfigStore;
    resolveCentralInventoryPath: (
      config: MaestroConfig,
    ) => Promise<string | undefined> | string | undefined;
  }) {
    this.fs = deps.fs;
    this.store = deps.store;
    this.resolveCentralInventoryPath = deps.resolveCentralInventoryPath;
  }

  async list(): Promise<RegisteredRepo[]> {
    return (await this.store.read()).repos;
  }

  // One stat per path on every read: a list that lies about the disk is worse
  // than none (#1009).
  async listWithStatus(): Promise<(RegisteredRepo & { status: RepoStatus })[]> {
    const repos = await this.list();
    return Promise.all(
      repos.map(async (repo) => ({
        ...repo,
        status: await this.statusOf(repo.path),
      })),
    );
  }

  private async statusOf(path: string): Promise<RepoStatus> {
    const isFolder = await this.fs.isDirectory(path).catch(() => false);
    if (!isFolder) {
      return "folder-missing";
    }
    return (await this.isGitRepo(path)) ? "ready" : "not-a-git-repo";
  }

  // A worktree's `.git` is a file, so presence is the test, not its type.
  private isGitRepo(path: string): Promise<boolean> {
    return this.fs.exists(join(path, ".git"));
  }

  // Called before any filesystem or apm access. Exact match after realpath, and
  // never throws: a missing path is simply not registered (security.md).
  async resolveRegistered(input: string): Promise<RegisteredRepo | undefined> {
    let real: string;
    try {
      real = await this.fs.realpath(input);
    } catch {
      return undefined;
    }
    const { repos } = await this.store.read();
    return repos.find((repo) => repo.path === real);
  }

  async isRegistered(input: string): Promise<boolean> {
    return (await this.resolveRegistered(input)) !== undefined;
  }

  /** What `register` would answer, with nothing written: the after-pick check. */
  async check(input: string): Promise<CheckResult> {
    return this.checkAgainst(input, await this.store.read());
  }

  private async checkAgainst(
    input: string,
    config: MaestroConfig,
  ): Promise<CheckResult> {
    const validated = await validateRepoPath(input, this.fs);
    if (!validated.ok) {
      return validated;
    }
    if (config.repos.some((repo) => repo.path === validated.path)) {
      return { ok: false, error: "already-registered" };
    }
    const inventoryPath = await this.resolveCentralInventoryPath(config);
    if (inventoryPath !== undefined) {
      const canonicalInventoryPath = await this.fs
        .realpath(inventoryPath)
        .catch(() => inventoryPath);
      if (validated.path === canonicalInventoryPath) {
        return { ok: false, error: "central-inventory" };
      }
    }
    if (!(await this.isGitRepo(validated.path))) {
      return { ok: false, error: "not-a-git-repo" };
    }
    return validated;
  }

  // Read-modify-write through the store's one lock, so a registration landing
  // beside a connect or a freshness record cannot drop either.
  async register(input: string): Promise<RegisterResult> {
    return this.store.update<RegisterResult>(async (config) => {
      const checked = await this.checkAgainst(input, config);
      if (!checked.ok) {
        return { result: checked };
      }
      const next = [...config.repos, { path: checked.path }];

      // Spread, because the store rewrites the whole file: without it a
      // registration wipes a value another use-case persisted.
      return {
        config: { ...config, repos: next },
        result: { ok: true, repos: next },
      };
    });
  }

  // By the stored path, never a realpath: a folder that is gone must still be
  // droppable. Deployed files and operation records stay as they are.
  async unregister(path: string): Promise<UnregisterResult> {
    return this.store.update<UnregisterResult>(async (config) => {
      if (!config.repos.some((repo) => repo.path === path)) {
        return { result: { ok: false, error: "not-registered" } };
      }
      const next = config.repos.filter((repo) => repo.path !== path);
      return {
        config: { ...config, repos: next },
        result: { ok: true, repos: next },
      };
    });
  }
}
