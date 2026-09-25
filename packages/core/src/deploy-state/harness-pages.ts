// The connected Harness's GitHub pages a skill row's release links to (#1181):
// the release's own page and each skill's folder at its tag.
import { isValidSkillSlug } from "../deploy/package-ref";
import { type GitHubPage, UNKNOWN_PAGE } from "../git/github-page";
import { RELEASE_TAG_PATTERN } from "../harness/release-tag";
import { harnessSkillSubpath } from "../inventory/harness-layout";
import type { LockfileEntry } from "../lockfile/lockfile";

export type HarnessPages = {
  release: GitHubPage;
  skill: (name: string) => GitHubPage | undefined;
};

// Undefined where nothing links: no Harness page, an entry from another
// repository, or a ref that is not a release tag. A failed read is unknown
// only where the entry could otherwise link, since then whether it is the
// Harness cannot be told.
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

// A per-skill dependency from before the root-package model links to its own
// folder at its own tag, the way a root package's skills do.
export const perSkillPage = (
  entry: LockfileEntry,
  name: string,
  page: GitHubPage | null,
): GitHubPage | undefined =>
  entry.virtual_path === harnessSkillSubpath(name)
    ? harnessPages(entry, page)?.skill(name)
    : undefined;
