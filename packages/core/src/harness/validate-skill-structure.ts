import { parse } from "yaml";

export type StructuralProblem =
  | "missing-manifest"
  | "invalid-frontmatter"
  | "empty-description";

export type StructuralFinding = { skill: string; problem: StructuralProblem };

export const splitFrontmatter = (
  raw: string,
): { block: string; body: string } | null => {
  const match = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(raw);
  return match === null
    ? null
    : { block: match[1] ?? "", body: raw.slice(match[0].length) };
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
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  return { block, data: data as Record<string, unknown> };
};

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
