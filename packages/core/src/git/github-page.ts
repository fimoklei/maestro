// A repository's own page on GitHub, for the cockpit's GitHub column (#1126).
import { parseGitOrigin } from "../deploy/git-origin";
import { readConfiguredGitOrigin } from "../deploy/git-origin-url";

// Absent where there is no page; `unknown` where the origin read failed, which
// the column shows as its own Unknown badge (design.md → Status).
export type GitHubPage = { kind: "link"; url: string } | { kind: "unknown" };

export const UNKNOWN_PAGE: GitHubPage = { kind: "unknown" };

// GitHub's own name rules: an owner is letters, digits and hyphens; a
// repository adds dots and underscores. Anything else never reaches an href.
export const OWNER_REPO_PATTERN = "[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}";
const OWNER_REPO = new RegExp(`^${OWNER_REPO_PATTERN}$`);

export function githubPageFromOriginUrl(url: string | null): GitHubPage | null {
  const origin = url === null ? null : parseGitOrigin(url);
  return origin !== null && OWNER_REPO.test(origin.ownerRepo)
    ? { kind: "link", url: `https://github.com/${origin.ownerRepo}` }
    : null;
}

// `git config --get` exits 1 for an unset key and 128 for a folder it cannot
// enter (git 2.50.1): only the first is "no origin".
export async function readGitHubPage(
  repoPath: string,
): Promise<GitHubPage | null> {
  const origin = await readConfiguredGitOrigin(repoPath);
  if (!origin.ok) return origin.exitCode === 1 ? null : UNKNOWN_PAGE;
  return githubPageFromOriginUrl(origin.stdout || null);
}
