import { runGitProcess } from "../git/run-git-text";

export type HeadProbe = "commit" | "no-head" | "unknown";

export const probeHead = async (repoPath: string): Promise<HeadProbe> => {
  const outcome = await runGitProcess(repoPath, [
    "rev-parse",
    "--verify",
    "--quiet",
    "HEAD^{commit}",
  ]);
  if (outcome.ok) {
    return outcome.stdout.trim().length > 0 ? "commit" : "no-head";
  }
  return outcome.failure === "failed" &&
    outcome.exitCode === 1 &&
    outcome.stderr.trim() === ""
    ? "no-head"
    : "unknown";
};
