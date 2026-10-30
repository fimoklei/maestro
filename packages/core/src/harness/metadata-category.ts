// The category a SKILL.md or prompt file names in `metadata.category`.
// Web imports it at runtime through `@maestro/core/prompt-file`, so no `node:` module.
import {
  categoryNameProblem,
  trimCategoryName,
} from "../categories/category-name";

const isMap = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The parsed front matter's category; anything but a valid name reads as none. */
export const metadataCategory = (frontmatter: unknown): string | null => {
  if (!isMap(frontmatter) || !isMap(frontmatter.metadata)) return null;
  const { category } = frontmatter.metadata;
  if (typeof category !== "string") return null;
  const name = trimCategoryName(category);
  return categoryNameProblem(name) === null ? name : null;
};
