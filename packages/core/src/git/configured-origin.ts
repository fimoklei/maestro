import { type GitRun, runGit, runGitText } from "./run-git-text";

const CONFIGURED_ORIGIN = ["config", "--get", "remote.origin.url"];

export const readConfiguredGitOriginUrl = (
  repoPath: string,
): Promise<string | null> => runGitText(repoPath, CONFIGURED_ORIGIN);

export const readConfiguredGitOrigin = (repoPath: string): Promise<GitRun> =>
  runGit(repoPath, CONFIGURED_ORIGIN);
