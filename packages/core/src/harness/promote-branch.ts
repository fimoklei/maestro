// One remote branch per skill under review, and the GitHub page that opens its
// pull request. Maestro never calls the GitHub API — the URL is built from the
// connected origin and the branch name (#574).
import type { GitOrigin } from "../deploy/git-origin";
import { isValidSkillSlug } from "../deploy/package-ref";

// The one namespace promote branches live in, written once: the adapter pushes
// into it and the movement read reads back out of it.
export const PROMOTE_NAMESPACE = "maestro";

// A skill's identity is its directory name, and promoting is the first step
// toward deploying it — so the gate is the deploy's own slug rule, never a
// second one beside it. A slug is also a plain directory name and a legal
// refname, so it can be spent as a pathspec and as a ref (security.md).
export const isPromotableSkillName = (name: string): boolean =>
  isValidSkillSlug(name);

export const promoteBranch = (name: string): string =>
  `${PROMOTE_NAMESPACE}/${name}`;

// `compare/<base>...<head>?expand=1` is GitHub's own pull-request form. The
// base is whatever the remote calls its default branch, so it is escaped; the
// head is a validated skill name behind a fixed prefix.
export const promoteCompareUrl = (
  origin: GitOrigin,
  defaultBranch: string,
  name: string,
): string =>
  `https://${origin.host}/${origin.ownerRepo}/compare/${encodeURIComponent(defaultBranch)}...${PROMOTE_NAMESPACE}/${encodeURIComponent(name)}?expand=1`;
