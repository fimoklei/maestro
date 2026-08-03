// Any failure is null, so the caller reports "origin unavailable" rather than
// guessing (security.md).
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const readGitOriginUrl = (repoPath: string): Promise<string | null> =>
  // `remote get-url` resolves `url.<other>.insteadOf` rewrites, so this is the
  // URL git would actually reach — the one a deploy must be able to resolve.
  readUrl(repoPath, ["remote", "get-url", "origin"]);

// The URL the author configured, before any transport rewrite. What the Harness
// view names as the origin: a local mirror standing in for github.com is a
// transport detail, not the repository the author is releasing.
export const readConfiguredGitOriginUrl = (
  repoPath: string,
): Promise<string | null> =>
  readUrl(repoPath, ["config", "--get", "remote.origin.url"]);

const readUrl = async (
  repoPath: string,
  args: string[],
): Promise<string | null> => {
  try {
    const { stdout } = await run("git", ["-C", repoPath, ...args]);
    const url = stdout.trim();
    return url.length > 0 ? url : null;
  } catch {
    return null;
  }
};
