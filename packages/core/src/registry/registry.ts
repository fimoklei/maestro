// The consuming-repo registry, and the path allowlist every path-taking
// endpoint checks against (security.md).
import type { ConfigStore, MaestroConfig } from "./config-store";
import type { FileSystemPort } from "./file-system";
import { type RepoPathError, validateRepoPath } from "./repo-path";

export type RegisteredRepo = { path: string };

type RegisterError = RepoPathError | "central-inventory";

type RegisterResult =
  | { ok: true; repos: RegisteredRepo[] }
  | { ok: false; error: RegisterError };

export class Registry {
  private readonly fs: FileSystemPort;
  private readonly store: ConfigStore;
  private readonly resolveCentralInventoryPath: (
    config: MaestroConfig,
  ) => Promise<string | undefined> | string | undefined;
  // Serializes register's read-modify-write: the store rewrites the whole file,
  // so two concurrent registrations would clobber each other.
  private tail: Promise<unknown> = Promise.resolve();

  constructor(deps: {
    fs: FileSystemPort;
    store: ConfigStore;
    resolveCentralInventoryPath?: (
      config: MaestroConfig,
    ) => Promise<string | undefined> | string | undefined;
  }) {
    this.fs = deps.fs;
    this.store = deps.store;
    this.resolveCentralInventoryPath =
      deps.resolveCentralInventoryPath ?? ((config) => config.inventoryPath);
  }

  async list(): Promise<RegisteredRepo[]> {
    return (await this.store.read()).repos;
  }

  // Called before any filesystem or apm access. Exact match after realpath, and
  // never throws: a missing path is simply not registered (security.md).
  async isRegistered(input: string): Promise<boolean> {
    let real: string;
    try {
      real = await this.fs.realpath(input);
    } catch {
      return false;
    }
    const { repos } = await this.store.read();
    return repos.some((repo) => repo.path === real);
  }

  async register(input: string): Promise<RegisterResult> {
    const result = this.tail.then(() => this.registerExclusive(input));
    // Keep the chain alive even when a registration rejects.
    this.tail = result.catch(() => undefined);
    return result;
  }

  private async registerExclusive(input: string): Promise<RegisterResult> {
    const validated = await validateRepoPath(input, this.fs);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }

    const config = await this.store.read();
    const inventoryPath = await this.resolveCentralInventoryPath(config);
    if (inventoryPath !== undefined) {
      const canonicalInventoryPath = await this.fs
        .realpath(inventoryPath)
        .catch(() => inventoryPath);
      if (validated.path === canonicalInventoryPath) {
        return { ok: false, error: "central-inventory" };
      }
    }
    const repo: RegisteredRepo = { path: validated.path };
    const next = config.repos.some((r) => r.path === repo.path)
      ? config.repos
      : [...config.repos, repo];

    // Spread, because the store rewrites the whole file: without it a
    // registration wipes a value another use-case persisted.
    await this.store.write({ ...config, repos: next });
    return { ok: true, repos: next };
  }
}
