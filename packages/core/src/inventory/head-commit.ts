// Three answers: git failing to look is not an empty repository, and only a
// proven empty one may be read as an interrupted clone (#555).
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type HeadProbe = "commit" | "no-head" | "unknown";

export const probeHead = async (repoPath: string): Promise<HeadProbe> => {
  try {
    const { stdout } = await run("git", [
      "-C",
      repoPath,
      "rev-parse",
      "--verify",
      "--quiet",
      "HEAD^{commit}",
    ]);
    return stdout.trim().length > 0 ? "commit" : "no-head";
  } catch (error) {
    // `--quiet`: "no commit" exits 1 silently; every other failure prints.
    const { code, stderr } = error as {
      code?: number | string;
      stderr?: string;
    };
    return code === 1 && (stderr ?? "").trim() === "" ? "no-head" : "unknown";
  }
};
