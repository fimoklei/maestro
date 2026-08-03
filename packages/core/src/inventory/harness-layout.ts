// The canonical Harness shape, written once so no reader invents a second one
// (ADR-0021 §4). The retired root `skills/` layout is not a fallback.

export const HARNESS_MANIFEST = "apm.yml";

export const HARNESS_SKILLS_DIR = ".apm/skills";

export const harnessSkillSubpath = (name: string): string =>
  `${HARNESS_SKILLS_DIR}/${name}`;
