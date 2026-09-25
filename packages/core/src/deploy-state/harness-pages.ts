// The connected Harness's GitHub pages a root package's release and skills
// link to (#1181): the release's own page and each skill's folder at its tag.
import { isValidSkillSlug } from "../deploy/package-ref";
import type { GitHubPage } from "../git/github-page";
import { RELEASE_TAG_PATTERN } from "../harness/release-tag";
import { harnessSkillSubpath } from "../inventory/harness-layout";
import type { LockfileEntry } from "../lockfile/lockfile";

export type HarnessPages = {
  release: GitHubPage;
  skill: (name: string) => GitHubPage | undefined;
};

const UNKNOWN: GitHubPage = { kind: "unknown" };

// Undefined where nothing links: no Harness page, a root package from another
// repository, or a ref that is not a release tag. A failed read is unknown,
// since whether the root package is the Harness cannot be told.
export function harnessPages(
  root: LockfileEntry,
  page: GitHubPage | null,
): HarnessPages | undefined {
  if (page === null) return undefined;
  if (page.kind === "unknown")
    return { release: UNKNOWN, skill: () => UNKNOWN };
  const tag = root.resolved_ref;
  if (
    root.host !== "github.com" ||
    page.url !== `https://github.com/${root.repo_url}` ||
    !RELEASE_TAG_PATTERN.test(tag)
  ) {
    return undefined;
  }
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
