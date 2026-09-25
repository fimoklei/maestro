import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// `--show-toplevel` prints the resolved path, so pass a realpath'd one.
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
