// Adapter: read a clone's origin remote url with real git. execFile with an
// args array — the path goes in as data, never as command text (security.md).
// Any failure (not a repo, no origin remote, git missing) is null: the caller
// reports "origin unavailable" instead of guessing.
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
