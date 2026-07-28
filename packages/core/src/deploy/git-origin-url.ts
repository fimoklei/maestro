// Any failure is null, so the caller reports "origin unavailable" rather than
// guessing (security.md).
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const readGitOriginUrl = async (
  repoPath: string,
): Promise<string | null> => {
  try {
    const { stdout } = await run("git", [
      "-C",
      repoPath,
      "remote",
      "get-url",
      "origin",
    ]);
    const url = stdout.trim();
    return url.length > 0 ? url : null;
  } catch {
    return null;
  }
};
