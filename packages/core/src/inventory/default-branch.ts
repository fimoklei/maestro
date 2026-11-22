import { runGitText } from "../git/run-git-text";

const REMOTE_HEAD = "refs/remotes/origin/HEAD";
const REMOTE_BRANCHES = "refs/remotes/origin";

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
  // Read back: the write's own result says nothing.
  await runGitText(repoPath, [
    "symbolic-ref",
    REMOTE_HEAD,
    `${REMOTE_BRANCHES}/${only}`,
  ]);
  return await readRemoteDefaultBranch(repoPath);
};

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

const provenSoleBranch = async (repoPath: string): Promise<string | null> => {
  if (!(await fetchesEveryBranch(repoPath))) {
    return null;
  }
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
  if (refspecs.some((refspec) => refspec.startsWith("^"))) {
    return false;
  }
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
