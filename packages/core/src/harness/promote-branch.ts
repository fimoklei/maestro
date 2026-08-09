// One remote branch per skill under review, and the GitHub page that opens its
// pull request. Maestro never calls the GitHub API — the URL is built from the
// connected origin and the branch name (#574).
import type { GitOrigin } from "../deploy/git-origin";

// The one namespace promote branches live in, written once: the adapter pushes
// into it and the movement read reads back out of it.
export const PROMOTE_NAMESPACE = "maestro";

// A skill's identity is its directory name, and that name is spent twice: as a
// git pathspec under `.apm/skills`, and as the last segment of a ref. Plain
// directory names only, so neither can be steered elsewhere (security.md).
const PLAIN_DIRECTORY_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// The trailing three are git's own refname rules (`git check-ref-format`):
// refused here, so they read as a bad name rather than as a remote refusal.
export const isPromotableSkillName = (name: string): boolean =>
  PLAIN_DIRECTORY_NAME.test(name) &&
  !name.includes("..") &&
  !name.endsWith(".") &&
  !name.endsWith(".lock");

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
