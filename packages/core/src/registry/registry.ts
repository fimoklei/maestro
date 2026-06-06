// The consuming-repo registry: validate a pasted path, then persist it through
// the ConfigStore. This registry doubles as the path allowlist every later
// path-taking endpoint checks against (see .claude/rules/security.md).
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

  constructor(deps: { fs: FileSystemPort; store: ConfigStore }) {
    this.fs = deps.fs;
    this.store = deps.store;
  }

  async list(): Promise<RegisteredRepo[]> {
    return (await this.store.read()).repos;
  }

  async register(input: string): Promise<RegisterResult> {
    const validated = await validateRepoPath(input, this.fs);
    if (!validated.ok) {
      return { ok: false, error: validated.error };
    }

    const { repos } = await this.store.read();
    const repo: RegisteredRepo = { path: validated.path };
    const next = repos.some((r) => r.path === repo.path)
      ? repos
      : [...repos, repo];

    await this.store.write({ repos: next });
    return { ok: true, repos: next };
  }
}
