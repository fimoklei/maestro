// The connected Harness's default branch, read offline and never guessed
// (#553).
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const REMOTE_HEAD = "refs/remotes/origin/HEAD";
const REMOTE_BRANCHES = "refs/remotes/origin";

// The refspec of a clone that fetches every branch. A narrower one (`git clone
// --single-branch`) leaves refs the repair below must not reason from.
const ALL_BRANCHES = "refs/heads/*";

export const resolveDefaultBranch = async (
  repoPath: string,
): Promise<string | null> => {
  const known = await readRemoteDefaultBranch(repoPath);
  if (known !== null) {
    return known;
  }

  const only = await provenSoleBranch(repoPath);
  if (only === null) {
    return null;
  }
  // Read back rather than trusted: the write prints nothing, so its own
  // result says nothing about what the repo now holds.
  await git(repoPath, [
    "symbolic-ref",
    REMOTE_HEAD,
    `${REMOTE_BRANCHES}/${only}`,
  ]);
  return await readRemoteDefaultBranch(repoPath);
};

// `origin/main` names the local mirror; the branch is what follows. One owner
// for that strip: connect refuses a Harness on this answer and the release
// pushes to it, so the two may never disagree.
export const readRemoteDefaultBranch = async (
  repoPath: string,
): Promise<string | null> => {
  const ref = await git(repoPath, ["symbolic-ref", "--short", REMOTE_HEAD]);
  return ref === null ? null : ref.replace(/^origin\//, "");
};

// The remote's only branch, and therefore the one its HEAD must point at — not
// a guess, which is why both halves are required: a clone that fetches every
// branch, holding exactly one. A single-branch clone holds one ref because it
// asked for one, and that ref says nothing about the remote's default.
const provenSoleBranch = async (repoPath: string): Promise<string | null> => {
  if (!(await fetchesEveryBranch(repoPath))) {
    return null;
  }
  // lstrip drops `refs/remotes/origin/`, so a branch named `release/2` keeps
  // its slash. `origin/HEAD` is listed here too and is not a branch.
  const listing = await git(repoPath, [
    "for-each-ref",
    "--format=%(refname:lstrip=3)",
    REMOTE_BRANCHES,
  ]);
  const branches =
    listing?.split("\n").filter((name) => name !== "" && name !== "HEAD") ?? [];
  return branches.length === 1 ? (branches[0] ?? null) : null;
};

const fetchesEveryBranch = async (repoPath: string): Promise<boolean> => {
  const refspecs = await git(repoPath, [
    "config",
    "--get-all",
    "remote.origin.fetch",
  ]);
  // The leading `+` is force-update, which this question does not turn on.
  return (refspecs?.split("\n") ?? []).some((refspec) =>
    refspec.replace(/^\+/, "").startsWith(`${ALL_BRANCHES}:`),
  );
};

// Null on any failure, so an unset `origin/HEAD` reads as "not known" rather
// than throwing. Output is trimmed, never parsed here.
const git = async (
  repoPath: string,
  args: string[],
): Promise<string | null> => {
  try {
    const { stdout } = await run("git", ["-C", repoPath, ...args]);
    const output = stdout.trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
};
