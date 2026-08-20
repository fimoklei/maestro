// Shared test fixture: turns a directory into a real git repo, optionally with
// an origin remote. Connect requires a parseable git origin (#147) and a
// resolvable default branch (#553), so suites that build a connectable clone
// need this — offline throughout: the remote URL is never fetched.
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

const FIXTURE_ORIGIN_URL = "git@github.com:fimoklei/agent-harness.git";

// The empty tree's fixed hash (`git hash-object -t tree /dev/null`): a real
// object every repo already has, so the fixture's commit needs no working tree.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

// A commit needs an author and a committer, and the fixture may not borrow the
// machine's. `.invalid` is reserved and can never resolve (RFC 2606).
const FIXTURE_IDENTITY = {
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

export type GitCloneOptions = {
  origin?: boolean;
  // The branch `origin/HEAD` points at. `false` leaves it unset, as in a clone
  // made before git recorded it — the state the connect route has to repair.
  defaultBranch?: string | false;
  // Whether that branch's own ref is created. `false` leaves `origin/HEAD`
  // dangling, as a fetch that pruned the branch out from under it does.
  defaultBranchExists?: boolean;
  // Remote-tracking branches created beside `origin/HEAD`. The offline repair
  // reads these, so how many there are decides whether it can answer.
  remoteBranches?: string[];
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
    // A real commit, because a branch that points at anything else is a shape
    // git itself never produces — a fixture built on one proves nothing.
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
}

// Cleanup for a temp tree holding a real bare remote. A push leaves git's own
// background maintenance writing into `objects/` after the push has returned,
// so an `rm` racing it fails with ENOTEMPTY (CI run 32409739829, 2026-08-20).
// `maxRetries` is Node's answer to exactly that race (fsPromises.rm docs).
export const removeGitTempTree = (path: string) =>
  rm(path, { recursive: true, force: true, maxRetries: 5 });
