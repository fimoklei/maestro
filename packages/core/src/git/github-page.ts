// A repository's own page on GitHub, for the cockpit's GitHub column (#1126).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseGitOrigin } from "../deploy/git-origin";

const run = promisify(execFile);

// Absent where there is no page; `unknown` where the origin read failed, which
// the column shows as its own Unknown badge (design.md → Status).
export type GitHubPage = { kind: "link"; url: string } | { kind: "unknown" };

// GitHub's own name rules: an owner is letters, digits and hyphens; a
// repository adds dots and underscores. Anything else never reaches an href.
const OWNER_REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

export function githubPageFromOriginUrl(url: string | null): GitHubPage | null {
  const origin = url === null ? null : parseGitOrigin(url);
  return origin !== null && OWNER_REPO.test(origin.ownerRepo)
    ? { kind: "link", url: `https://github.com/${origin.ownerRepo}` }
    : null;
}

// The configured URL, before any `insteadOf` rewrite (LEARNINGS.md ·
// git-remote-get-url-resolves-inteadof). `git config --get` exits 1 for an
// unset key and 128 for a folder it cannot enter (git 2.50.1).
export async function readGitHubPage(
  repoPath: string,
): Promise<GitHubPage | null> {
  try {
    const { stdout } = await run("git", [
      "-C",
      repoPath,
      "config",
      "--get",
      "remote.origin.url",
    ]);
    return githubPageFromOriginUrl(stdout.trim());
  } catch (error) {
    return (error as { code?: unknown }).code === 1
      ? null
      : { kind: "unknown" };
  }
}
