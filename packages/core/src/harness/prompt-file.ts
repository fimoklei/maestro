// The one owner of the prompt file format: read, write and the field rules.
// Web imports it at runtime (`@maestro/core/prompt-file`), so no `node:` module.
import { stringify } from "yaml";
import { isValidSkillSlug } from "../deploy/package-ref";
import { proposeSkillSlug } from "./skill-slug";
import { readFrontmatter, splitFrontmatter } from "./validate-skill-structure";

export type PromptDraft = { name: string; description: string; text: string };

export type PromptFile = { description: string; text: string };

/** Missing or broken front matter reads as an empty description. */
export const readPromptFile = (raw: string): PromptFile => {
  const description = readFrontmatter(raw)?.data.description;
  return {
    description: typeof description === "string" ? description : "",
    text: splitFrontmatter(raw)?.body ?? raw,
  };
};

// The serializer, never string joins, so a description cannot add a key or
// end the block. `lineWidth: 0` keeps it on one line.
export const writePromptFile = ({ description, text }: PromptFile): string =>
  `---\n${stringify({ description }, { lineWidth: 0 })}---\n${text}`;

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
    return { name, description: "", text: raw };
  }
  const { description } = frontmatter.data;
  return {
    name,
    description: typeof description === "string" ? oneLine(description) : "",
    text: body,
  };
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

/** Every rule the fields break, in field order; empty when all hold. */
export const promptFieldProblems = ({
  name,
  description,
  text,
}: PromptDraft): PromptFieldProblem[] => {
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
  } else if (new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) {
    problems.push("long-text");
  }
  return problems;
};
