// Turns a directory into a real git repo, optionally with an origin remote.
// Offline: the remote URL is never fetched.
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";
import { vi } from "vitest";
import { appendGitConfig } from "../../scripts/lib/git-config-env.mjs";

const run = promisify(execFile);

const FIXTURE_ORIGIN_URL = "git@github.com:fimoklei/agent-harness.git";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

// The fixture may not borrow the machine's identity; `.invalid` never
// resolves (RFC 2606).
const FIXTURE_IDENTITY = {
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

export type GitCloneOptions = {
  origin?: boolean;
  // `false` leaves it unset, the state the connect route has to repair.
  defaultBranch?: string | false;
  // `false` leaves `origin/HEAD` dangling.
  defaultBranchExists?: boolean;
  remoteBranches?: string[];
  // Publishes the tree as this release under `refs/maestro/tags/`, the only
  // namespace Inventory reads (#841).
  release?: string;
};

export async function initGitClone(
  root: string,
  options?: GitCloneOptions,
): Promise<void> {
  await run("git", ["init"], { cwd: root });
  if (options?.origin !== false) {
    await run("git", ["remote", "add", "origin", FIXTURE_ORIGIN_URL], {
      cwd: root,
    });
  }

  const defaultBranch = options?.defaultBranch ?? "main";
  const branches = new Set(options?.remoteBranches ?? []);
  if (defaultBranch !== false && options?.defaultBranchExists !== false) {
    branches.add(defaultBranch);
  }

  if (branches.size > 0) {
    const { stdout } = await run(
      "git",
      ["commit-tree", EMPTY_TREE, "-m", "fixture"],
      { cwd: root, env: { ...process.env, ...FIXTURE_IDENTITY } },
    );
    const commit = stdout.trim();
    for (const branch of branches) {
      await run(
        "git",
        ["update-ref", `refs/remotes/origin/${branch}`, commit],
        { cwd: root },
      );
    }
  }

  if (defaultBranch !== false) {
    await run(
      "git",
      [
        "symbolic-ref",
        "refs/remotes/origin/HEAD",
        `refs/remotes/origin/${defaultBranch}`,
      ],
      { cwd: root },
    );
  }

  if (options?.release !== undefined) {
    await run("git", ["add", "-A"], { cwd: root });
    const { stdout: tree } = await run("git", ["write-tree"], { cwd: root });
    const { stdout: commit } = await run(
      "git",
      ["commit-tree", tree.trim(), "-m", `release ${options.release}`],
      { cwd: root, env: { ...process.env, ...FIXTURE_IDENTITY } },
    );
    await run(
      "git",
      ["update-ref", `refs/maestro/tags/${options.release}`, commit.trim()],
      { cwd: root },
    );
  }
}

export const removeGitTempTree = (path: string) =>
  rm(path, { recursive: true, force: true });

/** Adds git config entries for this test after the ones the run already sets. */
export function stubGitConfig(pairs: [key: string, value: string][]): void {
  for (const [name, value] of Object.entries(
    appendGitConfig(process.env, pairs),
  )) {
    vi.stubEnv(name, value);
  }
}
