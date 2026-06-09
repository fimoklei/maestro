// Builds the tag-pinned package reference apm installs from
// (host/owner/repo/skills/<name>#<tag> — ADR-0003) and validates the skill
// name as a strict slug first. The slug check is the security gate that keeps
// a hostile name from becoming command text or a path escape (security.md).

const skillSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isValidSkillSlug = (name: string): boolean =>
  skillSlugPattern.test(name);

export const buildSkillPackageRef = (input: {
  host: string;
  ownerRepo: string;
  name: string;
  tag: string;
}): string =>
  `${input.host}/${input.ownerRepo}/skills/${input.name}#${input.tag}`;
