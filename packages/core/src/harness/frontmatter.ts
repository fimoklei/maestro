import { parse } from "yaml";
import {
  categoryNameProblem,
  trimCategoryName,
} from "../categories/category-name";

export type FrontmatterFields = {
  name?: string;
  description?: string;
  example?: string;
  category?: string;
};

type FrontmatterSplit = { block: string; body: string };

type Frontmatter = FrontmatterSplit & { fields: FrontmatterFields };

const isMapping = (
  value: unknown,
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const textOf = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const categoryOf = (metadata: unknown): string | undefined => {
  const category = isMapping(metadata) ? textOf(metadata.category) : undefined;
  if (category === undefined) {
    return undefined;
  }
  const name = trimCategoryName(category);
  return categoryNameProblem(name) === null ? name : undefined;
};

export const splitFrontmatter = (raw: string): FrontmatterSplit | null => {
  const match = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(raw);
  return match === null
    ? null
    : { block: match[1] ?? "", body: raw.slice(match[0].length) };
};

export const readFrontmatterFields = (
  block: string,
): FrontmatterFields | null => {
  let data: unknown;
  try {
    data = parse(block);
  } catch {
    return null;
  }
  if (!isMapping(data)) {
    return null;
  }
  return {
    name: textOf(data.name),
    description: textOf(data.description),
    example: textOf(data.example),
    category: categoryOf(data.metadata),
  };
};

export const readFrontmatter = (raw: string): Frontmatter | null => {
  const split = splitFrontmatter(raw);
  if (split === null) {
    return null;
  }
  const fields = readFrontmatterFields(split.block);
  return fields === null ? null : { ...split, fields };
};
