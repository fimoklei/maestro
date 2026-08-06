// Shared test fixture: turns a directory into a real git repo, optionally with
// an origin remote. Connect requires a parseable git origin (#147) and a
// resolvable default branch (#553), so suites that build a connectable clone
// need this — offline throughout: the remote URL is never fetched.
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const FIXTURE_ORIGIN_URL = "git@github.com:fimoklei/agent-harness.git";

// The empty tree's fixed hash (`git hash-object -t tree /dev/null`): a real
// object every repo already has, so a remote-tracking ref can exist here
// without committing anything.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export type GitCloneOptions = {
  origin?: boolean;
  // The branch `origin/HEAD` points at. `false` leaves it unset, as in a clone
  // made before git recorded it — the state the connect route has to repair.
  defaultBranch?: string | false;
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
  if (defaultBranch !== false) {
    branches.add(defaultBranch);
  }

  for (const branch of branches) {
    await run(
      "git",
      ["update-ref", `refs/remotes/origin/${branch}`, EMPTY_TREE],
      { cwd: root },
    );
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
