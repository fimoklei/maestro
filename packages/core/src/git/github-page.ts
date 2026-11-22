import { parseGitOrigin } from "../deploy/git-origin";
import { readConfiguredGitOrigin } from "./configured-origin";

export type GitHubPage = { kind: "link"; url: string } | { kind: "unknown" };

export const UNKNOWN_PAGE: GitHubPage = { kind: "unknown" };

export const OWNER_REPO_PATTERN = "[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}";
const OWNER_REPO = new RegExp(`^${OWNER_REPO_PATTERN}$`);

export function githubPageFromOriginUrl(url: string | null): GitHubPage | null {
  const origin = url === null ? null : parseGitOrigin(url);
  return origin !== null && OWNER_REPO.test(origin.ownerRepo)
    ? { kind: "link", url: `https://github.com/${origin.ownerRepo}` }
    : null;
}

export async function readGitHubPage(
  repoPath: string,
): Promise<GitHubPage | null> {
  const origin = await readConfiguredGitOrigin(repoPath);
  if (!origin.ok) return origin.exitCode === 1 ? null : UNKNOWN_PAGE;
  return githubPageFromOriginUrl(origin.stdout || null);
}
