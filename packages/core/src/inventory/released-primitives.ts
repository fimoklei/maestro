// Read from git, never the working tree: Inventory shows what was released.
import type { HarnessObject } from "../harness/harness-primitive";
import type { HarnessTag } from "../harness/read-harness-state";
import { highestReleaseTag } from "../harness/release-tag";

// `manifest` is the raw SKILL.md, or null where the release ships none.
export type ReleasedSkill = { name: string; manifest: string | null };

// `text` is the whole file, frontmatter included.
type ReleasedPrompt = { name: string; text: string };

type ReleasedPrimitives = {
  skills: ReleasedSkill[];
  prompts: ReleasedPrompt[];
};

// Null is an unreadable release; empty lists are "looked, found none".
export type ReadReleasedPrimitives = (
  root: string,
) => Promise<ReleasedPrimitives | null>;

type ReleasedPrimitivesGitPort = {
  readTags(root: string): Promise<HarnessTag[] | null>;
  readPrimitivesAtTag(
    root: string,
    tag: string,
  ): Promise<HarnessObject[] | null>;
  readSkillManifestsAtTag(
    root: string,
    tag: string,
    names: string[],
  ): Promise<Record<string, string | null>>;
  readPromptTextsAtTag(
    root: string,
    tag: string,
    names: string[],
  ): Promise<Record<string, string> | null>;
};

export const releasedPrimitivesFromGit =
  (git: ReleasedPrimitivesGitPort): ReadReleasedPrimitives =>
  async (root) => {
    const tags = await git.readTags(root);
    if (tags === null) {
      return null;
    }
    const tag = highestReleaseTag(tags);
    if (tag === null) {
      return { skills: [], prompts: [] };
    }
    const objects = await git.readPrimitivesAtTag(root, tag.name);
    if (objects === null) {
      return null;
    }
    const namesOf = (type: HarnessObject["type"]) =>
      objects.filter((object) => object.type === type).map(({ name }) => name);
    const skillNames = namesOf("skill");
    const promptNames = namesOf("prompt");
    const [manifests, texts] = await Promise.all([
      git.readSkillManifestsAtTag(root, tag.name, skillNames),
      git.readPromptTextsAtTag(root, tag.name, promptNames),
    ]);
    if (texts === null) {
      return null;
    }
    const prompts: ReleasedPrompt[] = [];
    for (const name of promptNames) {
      const text = texts[name];
      // A listed prompt whose file cannot be read leaves the release unread.
      if (text === undefined) {
        return null;
      }
      prompts.push({ name, text });
    }
    return {
      skills: skillNames.map((name) => ({
        name,
        manifest: manifests[name] ?? null,
      })),
      prompts,
    };
  };
