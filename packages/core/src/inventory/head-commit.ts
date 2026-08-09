// Whether a repository has a commit at HEAD, as three answers rather than two:
// git failing to look is not git reporting an empty repository, and only a
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
    // `--quiet` makes "HEAD names no commit" exit 1 and print nothing. Every
    // other failure — no repository, no permission, no git — says something.
    const { code, stderr } = error as {
      code?: number | string;
      stderr?: string;
    };
    return code === 1 && (stderr ?? "").trim() === "" ? "no-head" : "unknown";
  }
};
