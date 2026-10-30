// The one owner of the prompt file format: read, write and the field rules.
// Web imports it at runtime (`@maestro/core/prompt-file`), so no `node:` module.
import { isMap, parse, parseDocument, stringify } from "yaml";
import { isValidSkillSlug } from "../deploy/package-ref";
import { metadataCategory } from "./metadata-category";
import { proposeSkillSlug } from "./skill-slug";
import { readFrontmatter, splitFrontmatter } from "./validate-skill-structure";

export type PromptFile = { description: string; text: string };

/** `frontmatter` is the YAML between the delimiters; "" when there is none. */
export type PromptFileWrite = PromptFile & { frontmatter: string };

export type PromptDraft = PromptFileWrite & { name: string };

/** The fields the operator types; the front matter is not one. */
export type PromptFields = Omit<PromptDraft, "frontmatter">;

/** Missing or broken front matter reads as an empty description. */
export const readPromptFile = (raw: string): PromptFile => {
  const description = readFrontmatter(raw)?.data.description;
  return {
    description: typeof description === "string" ? description : "",
    text: splitFrontmatter(raw)?.body ?? raw,
  };
};

const descriptionOnly = (description: string): string =>
  `---\n${stringify({ description }, { lineWidth: 0 })}---\n`;

// A document start, end or directive line would end the block for another
// reader.
const documentMarker = /^(?:---|\.\.\.|%)/m;

// The serializer, never string joins, so a description cannot add a key or
// end the block. `lineWidth: 0` keeps it on one line. Front matter that is
// not a YAML map, or that would not read back as this file, gives way to a
// block holding only the description.
export const writePromptFile = ({
  frontmatter,
  description,
  text,
}: PromptFileWrite): string => {
  const document = parseDocument(frontmatter);
  if (document.errors.length > 0 || !isMap(document.contents)) {
    return `${descriptionOnly(description)}${text}`;
  }
  document.set("description", description);
  const yaml = document.toString({ lineWidth: 0 });
  const written = `---\n${yaml}---\n${text}`;
  const readsBack =
    !documentMarker.test(yaml) &&
    readFrontmatter(written)?.data.description === description &&
    splitFrontmatter(written)?.body === text;
  return readsBack ? written : `${descriptionOnly(description)}${text}`;
};

const fileSuffix = /(?:\.prompt)?\.(?:md|txt)$/i;

const oneLine = (value: string): string =>
  value.trim().replace(/\s*[\r\n]+\s*/g, " ");

/** What fills the import dialog; pasted text passes a null `fileName`. */
export const draftPrompt = (
  raw: string,
  fileName: string | null,
): PromptDraft => {
  const name =
    fileName === null ? "" : proposeSkillSlug(fileName.replace(fileSuffix, ""));
  const frontmatter = readFrontmatter(raw);
  const body = splitFrontmatter(raw)?.body;
  if (frontmatter === null || body === undefined) {
    return { name, frontmatter: "", description: "", text: raw };
  }
  const { description } = frontmatter.data;
  return {
    name,
    frontmatter: frontmatter.block,
    description: typeof description === "string" ? oneLine(description) : "",
    text: body,
  };
};

/** `metadata.category` in a drafted front matter block; null where it names none. */
export const promptCategory = (frontmatter: string): string | null => {
  try {
    return metadataCategory(parse(frontmatter));
  } catch {
    return null;
  }
};

export type PromptFieldProblem =
  | "empty-name"
  | "invalid-name"
  | "empty-description"
  | "multiline-description"
  | "long-description"
  | "empty-text"
  | "long-text";

/** The rule the name breaks, or null when it holds. */
export const promptNameProblem = (
  name: string,
): "empty-name" | "invalid-name" | null => {
  if (name === "") return "empty-name";
  return isValidSkillSlug(name) ? null : "invalid-name";
};

const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_TEXT_BYTES = 102_400;

/** Holds at most the 100 KB a prompt's text may hold. */
export const withinPromptLimit = (value: string): boolean =>
  new TextEncoder().encode(value).byteLength <= MAX_TEXT_BYTES;

/** The front matter a write keeps and the text, past 100 KB together. */
export const promptFileTooLong = ({
  frontmatter,
  text,
}: Pick<PromptFileWrite, "frontmatter" | "text">): boolean =>
  !withinPromptLimit(`${frontmatter}${text}`);

/** Every rule the fields break, in field order; empty when all hold. */
export const promptFieldProblems = ({
  name,
  description,
  text,
}: PromptFields): PromptFieldProblem[] => {
  const problems: PromptFieldProblem[] = [];
  const nameProblem = promptNameProblem(name);
  if (nameProblem !== null) {
    problems.push(nameProblem);
  }
  if (description.trim() === "") {
    problems.push("empty-description");
  } else if (/[\r\n]/.test(description)) {
    problems.push("multiline-description");
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    problems.push("long-description");
  }
  if (text.trim() === "") {
    problems.push("empty-text");
  } else if (!withinPromptLimit(text)) {
    problems.push("long-text");
  }
  return problems;
};

/** The field rules, and the 100 KB the pasted front matter and the text share. */
export const promptDraftProblems = (
  draft: PromptDraft,
): PromptFieldProblem[] => {
  const problems = promptFieldProblems(draft);
  return promptFileTooLong(draft) && !problems.includes("long-text")
    ? [...problems, "long-text"]
    : problems;
};
