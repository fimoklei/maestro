// The connected Harness's default branch, read offline and never guessed
// (#553).
import { runGitText } from "../git/run-git-text";

const REMOTE_HEAD = "refs/remotes/origin/HEAD";
const REMOTE_BRANCHES = "refs/remotes/origin";

// The refspec of a clone that mirrors every branch into `origin/`. A narrower
// one (`git clone --single-branch`), a wildcard aimed elsewhere, or an
// exclusion beside it all leave refs the repair below must not reason from.
const ALL_BRANCHES = `refs/heads/*:${REMOTE_BRANCHES}/*`;

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
  await runGitText(repoPath, [
    "symbolic-ref",
    REMOTE_HEAD,
    `${REMOTE_BRANCHES}/${only}`,
  ]);
  return await readRemoteDefaultBranch(repoPath);
};

// Whole, never `--short`: a target outside `origin/` or one a prune deleted
// still reads back as a plausible name. One owner for the rule — connect
// refuses a Harness on this answer and the release pushes to it.
export const readRemoteDefaultBranch = async (
  repoPath: string,
): Promise<string | null> => {
  const target = await runGitText(repoPath, ["symbolic-ref", REMOTE_HEAD]);
  if (target === null || !target.startsWith(`${REMOTE_BRANCHES}/`)) {
    return null;
  }
  if (!(await resolvesToCommit(repoPath, target))) {
    return null;
  }
  return target.slice(`${REMOTE_BRANCHES}/`.length);
};

// The remote's only branch, and so the one its HEAD must point at. Both halves
// are what make it proof: a clone that mirrors every branch, holding exactly
// one. Holding one because it asked for one says nothing about the remote.
const provenSoleBranch = async (repoPath: string): Promise<string | null> => {
  if (!(await fetchesEveryBranch(repoPath))) {
    return null;
  }
  // lstrip drops `refs/remotes/origin/`, so a branch named `release/2` keeps
  // its slash. `origin/HEAD` is listed here too and is not a branch.
  const listing = await runGitText(repoPath, [
    "for-each-ref",
    "--format=%(refname:lstrip=3)",
    REMOTE_BRANCHES,
  ]);
  const branches =
    listing?.split("\n").filter((name) => name !== "" && name !== "HEAD") ?? [];
  const only = branches.length === 1 ? branches[0] : undefined;
  if (only === undefined) {
    return null;
  }
  return (await resolvesToCommit(repoPath, `${REMOTE_BRANCHES}/${only}`))
    ? only
    : null;
};

const fetchesEveryBranch = async (repoPath: string): Promise<boolean> => {
  const refspecs =
    (
      await runGitText(repoPath, ["config", "--get-all", "remote.origin.fetch"])
    )?.split("\n") ?? [];
  // A `^` refspec excludes what the wildcard would otherwise have brought in,
  // so one of them anywhere leaves the namespace incomplete.
  if (refspecs.some((refspec) => refspec.startsWith("^"))) {
    return false;
  }
  // The leading `+` is force-update, which this question does not turn on.
  return refspecs.some(
    (refspec) => refspec.replace(/^\+/, "") === ALL_BRANCHES,
  );
};

const resolvesToCommit = async (
  repoPath: string,
  ref: string,
): Promise<boolean> =>
  (await runGitText(repoPath, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${ref}^{commit}`,
  ])) !== null;
