// Builds the tag-pinned ref apm installs from (ADR-0003). The slug check is the
// gate that keeps a hostile name out of command text or a path (security.md).

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
