import { runGit, runGitText } from "../git/run-git-text";

const OBJECT_NAME = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export async function remoteBranchHolds(
  root: string,
  branchRef: string,
  commit: string,
  refspec: string,
): Promise<boolean> {
  const listing = await runGitText(root, ["ls-remote", "origin", branchRef]);
  const [tip = ""] = (listing ?? "").split("\t");
  if (!OBJECT_NAME.test(tip)) {
    return false;
  }
  if (tip === commit) {
    return true;
  }
  const succeeds = async (args: string[]) => (await runGit(root, args)).ok;
  return (
    (await succeeds(["fetch", "origin", refspec])) &&
    (await succeeds(["merge-base", "--is-ancestor", commit, tip]))
  );
}
