// The one owner of the prompt file format: read, write and the field rules.
// Web imports it at runtime (`@maestro/core/prompt-file`), so no `node:` module.
import { Document, isMap, parse, parseDocument, Scalar } from "yaml";
import { isValidSkillSlug } from "../deploy/package-ref";
import { metadataCategory } from "./metadata-category";
import { proposeSkillSlug } from "./skill-slug";
import { readFrontmatter, splitFrontmatter } from "./validate-skill-structure";

/** `example` is "" when the prompt has none, as `description` is. */
export type PromptFile = { description: string; text: string; example: string };

// A record so a field added to `PromptFile` fails to compile here until the
// comparison covers it. `Object.keys` widens to `string[]`; the `satisfies`
// makes the keys exactly `PromptFile`'s.
const PROMPT_FILE_FIELDS = Object.keys({
  description: true,
  text: true,
  example: true,
} satisfies Record<keyof PromptFile, true>) as (keyof PromptFile)[];

/** Whether two prompts hold the same fields, byte for byte. */
export const samePrompt = (a: PromptFile, b: PromptFile): boolean =>
  PROMPT_FILE_FIELDS.every((field) => a[field] === b[field]);

/** `frontmatter` is the YAML between the delimiters; "" when there is none. */
export type PromptFileWrite = PromptFile & { frontmatter: string };

export type PromptDraft = PromptFileWrite & { name: string };

/** The fields the operator types; the front matter is not one. */
export type PromptFields = Omit<PromptDraft, "frontmatter">;

// A missing, non-text or blank example is none.
const exampleOf = (value: unknown): string =>
  typeof value === "string" && value.trim() !== "" ? value : "";

/** Missing or broken front matter reads as an empty description and example. */
export const readPromptFile = (raw: string): PromptFile => {
  const data = readFrontmatter(raw)?.data;
  return {
    description: typeof data?.description === "string" ? data.description : "",
    text: splitFrontmatter(raw)?.body ?? raw,
    example: exampleOf(data?.example),
  };
};

// A multi-line example is a literal block, so its lines read as typed.
const exampleNode = (document: Document, example: string): Scalar => {
  const node = document.createNode(example);
  if (example.includes("\n")) {
    node.type = Scalar.BLOCK_LITERAL;
  }
  return node;
};

const withExample = (document: Document, example: string): void => {
  if (example === "") {
    document.delete("example");
  } else {
    document.set("example", exampleNode(document, example));
  }
};

const yamlOf = (document: Document): string =>
  document.toString({ lineWidth: 0 });

const fieldsOnly = (description: string, example: string): string => {
  const document = new Document({ description });
  withExample(document, example);
  return `---\n${yamlOf(document)}---\n`;
};

// A document start, end or directive line would end the block for another
// reader.
const documentMarker = /^(?:---|\.\.\.|%)/m;

// The serializer, never string joins, so a description or an example cannot
// add a key or end the block. `lineWidth: 0` keeps the description on one
// line. An empty example removes the key. Front matter that is not a YAML
// map, or that would not read back as this file, gives way to a block holding
// only the description and the example.
export const writePromptFile = ({
  frontmatter,
  ...fields
}: PromptFileWrite): string => {
  const file = { ...fields, example: exampleOf(fields.example) };
  const { description, text, example } = file;
  const fallback = `${fieldsOnly(description, example)}${text}`;
  const document = parseDocument(frontmatter);
  if (document.errors.length > 0 || !isMap(document.contents)) {
    return fallback;
  }
  document.set("description", description);
  withExample(document, example);
  const yaml = yamlOf(document);
  const output = `---\n${yaml}---\n${text}`;
  const readsBack =
    !documentMarker.test(yaml) && samePrompt(readPromptFile(output), file);
  return readsBack ? output : fallback;
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
    return { name, frontmatter: "", description: "", text: raw, example: "" };
  }
  const { description, example } = frontmatter.data;
  return {
    name,
    frontmatter: frontmatter.block,
    description: typeof description === "string" ? oneLine(description) : "",
    text: body,
    example: exampleOf(example),
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

/** The file this write produces, past 100 KB. */
export const promptFileTooLong = (write: PromptFileWrite): boolean =>
  !withinPromptLimit(writePromptFile(write));

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

/** The field rules, and the 100 KB the written file may hold. */
export const promptDraftProblems = (
  draft: PromptDraft,
): PromptFieldProblem[] => {
  const problems = promptFieldProblems(draft);
  return promptFileTooLong(draft) && !problems.includes("long-text")
    ? [...problems, "long-text"]
    : problems;
};
