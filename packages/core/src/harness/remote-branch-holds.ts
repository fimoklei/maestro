import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitOptions } from "../git/non-interactive";
import { runGitText } from "../git/run-git-text";

const run = promisify(execFile);

// A SHA-1 or SHA-256 object name; anything else is no answer.
const OBJECT_NAME = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

// A push can fail after the remote already moved the branch, so the remote is
// asked (#577). The commit, or a descendant of it, at the tip counts as
// pushed. `refspec` fetches the tip so `merge-base` has its object.
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
  const succeeds = (args: string[]) =>
    run("git", ["-C", root, ...args], gitOptions()).then(
      () => true,
      () => false,
    );
  return (
    (await succeeds(["fetch", "origin", refspec])) &&
    (await succeeds(["merge-base", "--is-ancestor", commit, tip]))
  );
}
