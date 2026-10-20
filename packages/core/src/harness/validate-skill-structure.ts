// Advisory: a finding explains release risk, never blocks a release (#519).
import { parse } from "yaml";

export type StructuralProblem =
  | "missing-manifest"
  | "invalid-frontmatter"
  | "empty-description";

export type StructuralFinding = { skill: string; problem: StructuralProblem };

/** A closed frontmatter block and the text after it; null without one. */
export const splitFrontmatter = (
  raw: string,
): { block: string; body: string } | null => {
  // Both delimiters are whole lines: `---junk` closes nothing.
  const match = /^---\n([\s\S]*?)\n---[ \t]*(?:\r?\n|$)/.exec(raw);
  return match === null || match[1] === undefined
    ? null
    : { block: match[1], body: raw.slice(match[0].length) };
};

export const readFrontmatter = (
  raw: string,
): { block: string; data: Record<string, unknown> } | null => {
  const block = splitFrontmatter(raw)?.block;
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
