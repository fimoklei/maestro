// The commit HEAD resolves to, or null when there is none — the signal that
// separates a usable clone from the shell an interrupted one leaves (#555).
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const resolveHeadCommit = async (
  repoPath: string,
): Promise<string | null> => {
  try {
    const { stdout } = await run("git", [
      "-C",
      repoPath,
      "rev-parse",
      "--verify",
      "--quiet",
      "HEAD^{commit}",
    ]);
    const commit = stdout.trim();
    return commit.length > 0 ? commit : null;
  } catch {
    return null;
  }
};
