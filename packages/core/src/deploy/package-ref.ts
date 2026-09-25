// The slug check keeps a hostile name out of command text or a path.

import { harnessSkillSubpath } from "../inventory/harness-layout";

const skillSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Also a directory name and a git refname component: keep it short for all.
const MAX_SLUG_LENGTH = 64;

export const isValidSkillSlug = (name: string): boolean =>
  name.length <= MAX_SLUG_LENGTH && skillSlugPattern.test(name);

export { MAX_SLUG_LENGTH };

export const buildHarnessPackageRef = (input: {
  host: string;
  ownerRepo: string;
  tag: string;
}): string => `${input.host}/${input.ownerRepo}#${input.tag}`;

export const buildSkillPackageRef = (input: {
  host: string;
  ownerRepo: string;
  name: string;
  tag: string;
}): string =>
  `${input.host}/${input.ownerRepo}/${harnessSkillSubpath(input.name)}#${input.tag}`;
