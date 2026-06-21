// The consuming-repo registry: validate a pasted path, then persist it through
// the ConfigStore. This registry is intended to become the path allowlist every
// later path-taking endpoint checks against (see .claude/rules/security.md). The
// membership-check API (e.g. assertRegistered) is deliberately not built yet:
// the first endpoint that needs it — deploy / deploy-state-read — must add it
// here as one reusable, realpath-before-compare check, never re-derived per route.
import type { ConfigStore } from "./config-store";
import type { FileSystemPort } from "./file-system";
import { type RepoPathError, validateRepoPath } from "./repo-path";

export type RegisteredRepo = { path: string };

export type RegisterResult =
  | { ok: true; repos: RegisteredRepo[] }
  | { ok: false; error: RepoPathError };

export class Registry {
  private readonly fs: FileSystemPort;
  private readonly store: ConfigStore;
  // Serializes register's read-modify-write. The store rewrites the whole
  // config file, so two concurrent registrations would each read the same
  // baseline and the second write would clobber the first (a lost repo).
  // Chaining onto a tail promise makes the critical section one-at-a-time.
  private tail: Promise<unknown> = Promise.resolve();

  constructor(deps: { fs: FileSystemPort; store: ConfigStore }) {
    this.fs = deps.fs;
    this.store = deps.store;
  }

  async list(): Promise<RegisteredRepo[]> {
    return (await this.store.read()).repos;
  }

  // The path allowlist check every path-taking endpoint (deploy, deploy-state
  // read) must call before any filesystem or apm access. Canonicalizes the
  // input with realpath, then requires an exact match against a stored repo
  // (which were themselves canonicalized at registration). A path that does not
  // exist, or resolves outside the registry, is not registered — never throws.
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
    const repo: RegisteredRepo = { path: validated.path };
    const next = config.repos.some((r) => r.path === repo.path)
      ? config.repos
      : [...config.repos, repo];

    // Preserve every other config field (e.g. a connected inventoryPath): the
    // store rewrites the whole file, so spreading the read config keeps a
    // registration from wiping a value another use-case persisted.
    await this.store.write({ ...config, repos: next });
    return { ok: true, repos: next };
  }
}
