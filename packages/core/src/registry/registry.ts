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

  // Read-modify-write through the store's one lock, so a registration landing
  // beside a connect or a freshness record cannot drop either.
  async register(input: string): Promise<RegisterResult> {
    const validated = await validateRepoPath(input, this.fs);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }

    return this.store.update<RegisterResult>(async (config) => {
      const inventoryPath = await this.resolveCentralInventoryPath(config);
      if (inventoryPath !== undefined) {
        const canonicalInventoryPath = await this.fs
          .realpath(inventoryPath)
          .catch(() => inventoryPath);
        if (validated.path === canonicalInventoryPath) {
          return { result: { ok: false, error: "central-inventory" } };
        }
      }
      const repo: RegisteredRepo = { path: validated.path };
      const next = config.repos.some((r) => r.path === repo.path)
        ? config.repos
        : [...config.repos, repo];

      // Spread, because the store rewrites the whole file: without it a
      // registration wipes a value another use-case persisted.
      return {
        config: { ...config, repos: next },
        result: { ok: true, repos: next },
      };
    });
  }
}
