import type { GitOrigin } from "../deploy/git-origin";
import { isValidSkillSlug } from "../deploy/package-ref";

export const PROMOTE_NAMESPACE = "maestro";

// The deploy slug rule: the name is later used as a pathspec and as a ref.
export const isPromotableSkillName = (name: string): boolean =>
  isValidSkillSlug(name);

export const promoteBranch = (name: string): string =>
  `${PROMOTE_NAMESPACE}/${name}`;

export const proposalTitle = (name: string): string => `Promote skill: ${name}`;

export const PROPOSAL_BODY = "Proposed from the Maestro cockpit.";

// GitHub's pull-request form, built without the GitHub API (#574).
export const promoteCompareUrl = (
  origin: GitOrigin,
  defaultBranch: string,
  name: string,
): string =>
  `https://${origin.host}/${origin.ownerRepo}/compare/${encodeURIComponent(defaultBranch)}...${PROMOTE_NAMESPACE}/${encodeURIComponent(name)}?expand=1`;
