// What one in-memory commit holds, and the hashes git would give it.
import { createHash } from "node:crypto";
import type {
  HarnessObject,
  HarnessPrimitiveType,
  PrimitiveRef,
} from "./harness-primitive";
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

// `undefined` is a primitive the content lacks.
export const textOf = (
  content: Pick<Content, "skills" | "prompts">,
  { type, name }: PrimitiveRef,
): string | null | undefined =>
  type === "skill" ? content.skills[name] : content.prompts[name];
