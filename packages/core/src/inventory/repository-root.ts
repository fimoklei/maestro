// Whether a path is a repository's own root, not merely somewhere inside one.
// Every other git read answers from the enclosing repository, so without this a
// subdirectory reads as the clone that contains it (#556).
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// `--show-toplevel` prints the resolved path, so the caller must pass one too —
// `validateRepoPath` already realpaths what it returns.
export const isRepositoryRoot = async (repoPath: string): Promise<boolean> => {
  try {
    const { stdout } = await run("git", [
      "-C",
      repoPath,
      "rev-parse",
      "--show-toplevel",
    ]);
    return stdout.trim() === repoPath;
  } catch {
    return false;
  }
};
