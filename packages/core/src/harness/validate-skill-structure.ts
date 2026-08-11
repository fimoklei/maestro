// Three advisory rules over one skill's SKILL.md at origin/HEAD: the file
// exists, its frontmatter parses, and its description is non-empty. A finding
// explains release risk; it never blocks a release (#519, ADR-0021).
import { parse } from "yaml";

export type StructuralProblem =
  | "missing-manifest"
  | "invalid-frontmatter"
  | "empty-description";

export type StructuralFinding = { skill: string; problem: StructuralProblem };

// The frontmatter block and what it parses to, or null where the manifest has
// no readable one. Shared with import, so both read a manifest the same way.
export const readFrontmatter = (
  raw: string,
): { block: string; data: Record<string, unknown> } | null => {
  // Both delimiters are whole lines: `---junk` closes nothing, and matching it
  // would read a manifest git never opened as frontmatter.
  const block = /^---\n([\s\S]*?)\n---[ \t]*(?:\r?\n|$)/.exec(raw)?.[1];
  if (block === undefined) {
    return null;
  }
  let data: unknown;
  try {
    data = parse(block);
  } catch {
    return null;
  }
  // A list or a bare scalar parses but is not frontmatter. Reading it as a
  // mapping with no description would name the wrong problem.
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  return { block, data: data as Record<string, unknown> };
};

// Null where the skill passes every rule. `raw` is null when the file is
// absent at the ref — never an empty string, which is a present-but-blank file.
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
  const { description } = frontmatter.data;
  if (typeof description !== "string" || description.trim() === "") {
    return "empty-description";
  }
  return null;
};
