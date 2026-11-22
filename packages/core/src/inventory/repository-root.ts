import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const isRepositoryRoot = async (
  realRepoPath: string,
): Promise<boolean> => {
  try {
    const { stdout } = await run("git", [
      "-C",
      realRepoPath,
      "rev-parse",
      "--show-toplevel",
    ]);
    return stdout.trim() === realRepoPath;
  } catch {
    return false;
  }
};
