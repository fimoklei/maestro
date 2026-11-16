// What one in-memory commit holds, and the hashes git would give it.
import { createHash } from "node:crypto";
import { HARNESS_CATEGORIES_FILE } from "../inventory/harness-layout";
import type {
  HarnessObject,
  HarnessPrimitiveType,
  PrimitiveRef,
} from "./harness-primitive";
import type { ProposalSubject } from "./proposal-subject";
import type { HarnessSkillTree } from "./released-content";

// Skill name → its SKILL.md text, which stands for the whole folder; null is
// a folder with no SKILL.md.
export type Skills = Record<string, string | null>;

// Prompt name → its file text.
export type Prompts = Record<string, string>;

// `files`: any other file by its path, the categories file included.
export type Content = {
  skills: Skills;
  prompts: Prompts;
  files: Record<string, string>;
};

// The tree hash git would give this content.
export const treeHash = (content: string | null): string =>
  createHash("sha1")
    .update(content ?? "\0no-manifest")
    .digest("hex");

// The blob hash git would give this text; never a tree hash of the same text.
export const blobHash = (text: string): string =>
  createHash("sha1").update(`blob\0${text}`).digest("hex");

export const treesOf = (skills: Skills): HarnessSkillTree[] =>
  Object.entries(skills).map(([name, content]) => ({
    name,
    treeHash: treeHash(content),
  }));

export const hashesOf = (
  content: Pick<Content, "skills" | "prompts">,
  type: HarnessPrimitiveType,
): Record<string, string> =>
  type === "skill"
    ? Object.fromEntries(
        Object.entries(content.skills).map(([name, text]) => [
          name,
          treeHash(text),
        ]),
      )
    : Object.fromEntries(
        Object.entries(content.prompts).map(([name, text]) => [
          name,
          blobHash(text),
        ]),
      );

export const objectsOf = (
  content: Pick<Content, "skills" | "prompts">,
): HarnessObject[] => [
  ...Object.entries(hashesOf(content, "skill")).map(([name, hash]) => ({
    type: "skill" as const,
    name,
    hash,
  })),
  ...Object.entries(hashesOf(content, "prompt")).map(([name, hash]) => ({
    type: "prompt" as const,
    name,
    hash,
  })),
];

/** The categories file's blob hash; null where the content lacks it. */
export const listFileHash = (content: Content): string | null => {
  const text = content.files[HARNESS_CATEGORIES_FILE];
  return text === undefined ? null : blobHash(text);
};

/** `at` with each subject put back as `source` holds it, or removed. */
export const withSubjectsFrom = (
  at: Content,
  source: Content,
  subjects: readonly ProposalSubject[],
): Content => {
  const skills = { ...at.skills };
  const prompts = { ...at.prompts };
  const files = { ...at.files };
  const putBack = (
    map: Record<string, string | null>,
    key: string,
    held: string | null | undefined,
  ) => {
    delete map[key];
    if (held !== undefined) map[key] = held;
  };
  for (const subject of subjects) {
    if (subject.type === "categories") {
      const key = HARNESS_CATEGORIES_FILE;
      putBack(files, key, source.files[key]);
    } else {
      const map = subject.type === "skill" ? skills : prompts;
      putBack(map, subject.name, textOf(source, subject));
    }
  }
  return { skills, prompts, files };
};

// `undefined` is a primitive the content lacks.
export const textOf = (
  content: Pick<Content, "skills" | "prompts">,
  { type, name }: PrimitiveRef,
): string | null | undefined =>
  type === "skill" ? content.skills[name] : content.prompts[name];
