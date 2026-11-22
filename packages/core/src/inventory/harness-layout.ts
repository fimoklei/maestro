export const HARNESS_MANIFEST = "apm.yml";

export const HARNESS_SKILLS_DIR = ".apm/skills";

export const harnessSkillSubpath = (name: string): string =>
  `${HARNESS_SKILLS_DIR}/${name}`;

export const HARNESS_PROMPTS_DIR = ".maestro/prompts";

export const HARNESS_CATEGORIES_FILE = ".maestro/categories.yml";
