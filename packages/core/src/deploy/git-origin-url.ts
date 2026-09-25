import { runGitText } from "../git/run-git-text";

// Applies `insteadOf` rewrites: the URL git would actually reach.
export const readGitOriginUrl = (repoPath: string): Promise<string | null> =>
  runGitText(repoPath, ["remote", "get-url", "origin"]);

// The URL as configured, before any transport rewrite.
export const readConfiguredGitOriginUrl = (
  repoPath: string,
): Promise<string | null> =>
  runGitText(repoPath, ["config", "--get", "remote.origin.url"]);
