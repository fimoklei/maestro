export const CATEGORY_NAME_MAX_LENGTH = 64;

export type CategoryNameProblem =
  | "empty"
  | "too-long"
  | "control-character"
  | "reserved";

const UNCATEGORISED = "No category";

const CONTROL_CHARACTER = /[\p{Cc}\u2028\u2029]/u;

export const trimCategoryName = (raw: string): string => raw.trim();

export const categoryNameProblem = (
  name: string,
): CategoryNameProblem | null => {
  if (name.length === 0) return "empty";
  if ([...name].length > CATEGORY_NAME_MAX_LENGTH) return "too-long";
  if (CONTROL_CHARACTER.test(name)) return "control-character";
  if (sameCategoryName(name, UNCATEGORISED)) return "reserved";
  return null;
};

export const sameCategoryName = (a: string, b: string): boolean =>
  a.toLowerCase() === b.toLowerCase();

export const compareCategoryNames = (a: string, b: string): number => {
  const folded = a.toLowerCase().localeCompare(b.toLowerCase(), "en");
  return folded === 0 ? a.localeCompare(b, "en") : folded;
};
