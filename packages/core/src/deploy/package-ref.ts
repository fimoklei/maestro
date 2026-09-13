// Builds the tag-pinned ref apm installs from (ADR-0003). The slug check is the
// gate that keeps a hostile name out of command text or a path (security.md).

import { harnessSkillSubpath } from "../inventory/harness-layout";

const skillSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// A directory name, a git refname component and a package ref segment all at
// once, so it stays short enough for every one of them.
const MAX_SLUG_LENGTH = 64;

export const isValidSkillSlug = (name: string): boolean =>
  name.length <= MAX_SLUG_LENGTH && skillSlugPattern.test(name);

export { MAX_SLUG_LENGTH };

// The repository root, with no subpath: one dependency carrying a Selection,
// which is the shape a target follows one release in (ADR-0031).
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
