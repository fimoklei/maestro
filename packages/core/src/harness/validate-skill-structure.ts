import { readFrontmatter } from "./frontmatter";

export type StructuralProblem =
  | "missing-manifest"
  | "invalid-frontmatter"
  | "empty-description";

export type StructuralFinding = { skill: string; problem: StructuralProblem };

export const validateSkillStructure = (
  raw: string | null,
): StructuralProblem | null => {
  if (raw === null) {
    return "missing-manifest";
  }
  const frontmatter = readFrontmatter(raw);
  if (frontmatter === null) {
    return "invalid-frontmatter";
  }
  const { description } = frontmatter.fields;
  if (description === undefined || description.trim() === "") {
    return "empty-description";
  }
  return null;
};
