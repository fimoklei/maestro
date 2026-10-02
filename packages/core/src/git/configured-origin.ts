import { type GitRun, runGit, runGitText } from "./run-git-text";

const CONFIGURED_ORIGIN = ["config", "--get", "remote.origin.url"];

// The URL as configured, before any transport rewrite.
export const readConfiguredGitOriginUrl = (
  repoPath: string,
): Promise<string | null> => runGitText(repoPath, CONFIGURED_ORIGIN);

// The same read with its failure kept, for a caller that tells "no origin"
// from "could not read".
export const readConfiguredGitOrigin = (repoPath: string): Promise<GitRun> =>
  runGit(repoPath, CONFIGURED_ORIGIN);
