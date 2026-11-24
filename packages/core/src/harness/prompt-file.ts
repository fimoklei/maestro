// Web imports it at runtime (`@maestro/core/prompt-file`), so no `node:` module.
import { Document, isMap, parseDocument, Scalar } from "yaml";
import { isValidSkillSlug } from "../deploy/package-ref";
import {
  type FrontmatterFields,
  readFrontmatter,
  readFrontmatterFields,
  splitFrontmatter,
} from "./frontmatter";
import { proposeSkillSlug } from "./skill-slug";

export type PromptFile = { description: string; text: string; example: string };

export type PromptPart = Extract<keyof PromptFile, "text" | "example">;

// A record so a field added to `PromptFile` fails to compile here until the
// comparison covers it. `Object.keys` widens to `string[]`; the `satisfies`
// makes the keys exactly `PromptFile`'s.
const PROMPT_FILE_FIELDS = Object.keys({
  description: true,
  text: true,
  example: true,
} satisfies Record<keyof PromptFile, true>) as (keyof PromptFile)[];

export const samePrompt = (a: PromptFile, b: PromptFile): boolean =>
  PROMPT_FILE_FIELDS.every((field) => a[field] === b[field]);

export type PromptFileWrite = PromptFile & { frontmatter: string };

export type PromptDraft = PromptFileWrite & { name: string };

export type PromptFields = Omit<PromptDraft, "frontmatter">;

export const exampleOf = (value: unknown): string =>
  typeof value === "string" && value.trim() !== "" ? value : "";

const descriptionAndExample = (
  fields: FrontmatterFields | undefined,
): Omit<PromptFile, "text"> => ({
  description: fields?.description ?? "",
  example: exampleOf(fields?.example),
});

export const readPromptFile = (raw: string): PromptFile => ({
  ...descriptionAndExample(readFrontmatter(raw)?.fields),
  text: splitFrontmatter(raw)?.body ?? raw,
});

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

const documentMarker = /^(?:---|\.\.\.|%)/m;

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

export const draftPrompt = (
  raw: string,
  fileName: string | null,
): PromptDraft => {
  const name =
    fileName === null ? "" : proposeSkillSlug(fileName.replace(fileSuffix, ""));
  const frontmatter = readFrontmatter(raw);
  if (frontmatter === null) {
    return { name, frontmatter: "", description: "", text: raw, example: "" };
  }
  const { description, example } = descriptionAndExample(frontmatter.fields);
  return {
    name,
    frontmatter: frontmatter.block,
    description: oneLine(description),
    text: frontmatter.body,
    example,
  };
};

export const promptCategory = (frontmatter: string): string | null =>
  readFrontmatterFields(frontmatter)?.category ?? null;

export type PromptFieldProblem =
  | "empty-name"
  | "invalid-name"
  | "empty-description"
  | "multiline-description"
  | "long-description"
  | "empty-text"
  | "long-text";

export const promptNameProblem = (
  name: string,
): "empty-name" | "invalid-name" | null => {
  if (name === "") return "empty-name";
  return isValidSkillSlug(name) ? null : "invalid-name";
};

const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_TEXT_BYTES = 102_400;

export const withinPromptLimit = (value: string): boolean =>
  new TextEncoder().encode(value).byteLength <= MAX_TEXT_BYTES;

export const promptFileTooLong = (write: PromptFileWrite): boolean =>
  !withinPromptLimit(writePromptFile(write));

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

export const promptDraftProblems = (
  draft: PromptDraft,
): PromptFieldProblem[] => {
  const problems = promptFieldProblems(draft);
  return promptFileTooLong(draft) && !problems.includes("long-text")
    ? [...problems, "long-text"]
    : problems;
};
