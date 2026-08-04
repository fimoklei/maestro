// Three advisory rules over one skill's SKILL.md at origin/HEAD: the file
// exists, its frontmatter parses, and its description is non-empty. A finding
// explains release risk; it never blocks a release (#519, ADR-0021).
import { parse } from "yaml";

export type StructuralProblem =
  | "missing-manifest"
  | "invalid-frontmatter"
  | "empty-description";

export type StructuralFinding = { skill: string; problem: StructuralProblem };

// Null where the skill passes every rule. `raw` is null when the file is
// absent at the ref — never an empty string, which is a present-but-blank file.
export const validateSkillStructure = (
  raw: string | null,
): StructuralProblem | null => {
  if (raw === null) {
    return "missing-manifest";
  }
  const block = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1];
  if (block === undefined) {
    return "invalid-frontmatter";
  }
  let data: unknown;
  try {
    data = parse(block);
  } catch {
    return "invalid-frontmatter";
  }
  const description =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>).description
      : undefined;
  if (typeof description !== "string" || description.trim() === "") {
    return "empty-description";
  }
  return null;
};
