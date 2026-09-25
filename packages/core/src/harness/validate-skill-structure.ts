// Advisory: a finding explains release risk, never blocks a release (#519).
import { parse } from "yaml";

export type StructuralProblem =
  | "missing-manifest"
  | "invalid-frontmatter"
  | "empty-description";

export type StructuralFinding = { skill: string; problem: StructuralProblem };

export const readFrontmatter = (
  raw: string,
): { block: string; data: Record<string, unknown> } | null => {
  // Both delimiters are whole lines: `---junk` closes nothing.
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
  // A list or a bare scalar parses but is not frontmatter.
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  return { block, data: data as Record<string, unknown> };
};

// `raw` is null when the file is absent; "" is a present but blank file.
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
