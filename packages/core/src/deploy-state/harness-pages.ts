import { isValidSkillSlug } from "../deploy/package-ref";
import { type GitHubPage, UNKNOWN_PAGE } from "../git/github-page";
import { RELEASE_TAG_PATTERN } from "../harness/release-tag";
import { harnessSkillSubpath } from "../inventory/harness-layout";
import type { LockfileEntry } from "../lockfile/lockfile";
import type { ReleaseHead } from "./deploy-state-types";

export type HarnessPages = {
  release: GitHubPage;
  skill: (name: string) => GitHubPage | undefined;
};

export function harnessPages(
  entry: LockfileEntry,
  page: GitHubPage | null,
): HarnessPages | undefined {
  const tag = entry.resolved_ref;
  if (
    page === null ||
    entry.host !== "github.com" ||
    !RELEASE_TAG_PATTERN.test(tag)
  ) {
    return undefined;
  }
  if (page.kind === "unknown")
    return { release: UNKNOWN_PAGE, skill: () => UNKNOWN_PAGE };
  if (page.url !== `https://github.com/${entry.repo_url}`) return undefined;
  return {
    release: { kind: "link", url: `${page.url}/releases/tag/${tag}` },
    skill: (name) =>
      isValidSkillSlug(name)
        ? {
            kind: "link",
            url: `${page.url}/tree/${tag}/${harnessSkillSubpath(name)}`,
          }
        : undefined,
  };
}

export function latestReleasePage(
  release: GitHubPage | undefined,
  head: Pick<ReleaseHead, "release" | "latestRelease">,
): GitHubPage | undefined {
  const latest = head.latestRelease;
  if (
    release === undefined ||
    latest === null ||
    latest === head.release ||
    !RELEASE_TAG_PATTERN.test(latest)
  ) {
    return undefined;
  }
  if (release.kind === "unknown") return release;
  const current = `/releases/tag/${head.release}`;
  return release.url.endsWith(current)
    ? {
        kind: "link",
        url: `${release.url.slice(0, -current.length)}/releases/tag/${latest}`,
      }
    : undefined;
}

export const perSkillPage = (
  entry: LockfileEntry,
  name: string,
  page: GitHubPage | null,
): GitHubPage | undefined =>
  entry.virtual_path === harnessSkillSubpath(name)
    ? harnessPages(entry, page)?.skill(name)
    : undefined;
