// Any failure is null, so the caller reports "origin unavailable" rather than
// guessing (security.md).
import { type GitRun, runGit, runGitText } from "../git/run-git-text";

export const readGitOriginUrl = (repoPath: string): Promise<string | null> =>
  // `remote get-url` resolves `url.<other>.insteadOf` rewrites, so this is the
  // URL git would actually reach — the one a deploy must be able to resolve.
  runGitText(repoPath, ["remote", "get-url", "origin"]);

const CONFIGURED_ORIGIN = ["config", "--get", "remote.origin.url"];

// The URL the author configured, before any transport rewrite. What the Harness
// view names as the origin: a local mirror standing in for github.com is a
// transport detail, not the repository the author is releasing.
export const readConfiguredGitOriginUrl = (
  repoPath: string,
): Promise<string | null> => runGitText(repoPath, CONFIGURED_ORIGIN);

// The same read with its failure kept, for a caller that tells "no origin"
// from "could not read".
export const readConfiguredGitOrigin = (repoPath: string): Promise<GitRun> =>
  runGit(repoPath, CONFIGURED_ORIGIN);
