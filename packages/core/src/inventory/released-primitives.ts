import type { HarnessObject } from "../harness/harness-primitive";
import type { HarnessTag } from "../harness/read-harness-state";
import { highestReleaseTag } from "../harness/release-tag";

export type ReleasedSkill = { name: string; manifest: string | null };

type ReleasedPrompt = { name: string; text: string };

type ReleasedPrimitives = {
  skills: ReleasedSkill[];
  prompts: ReleasedPrompt[] | null;
};

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

const promptsOf = (
  names: string[],
  texts: Record<string, string>,
): ReleasedPrompt[] | null => {
  const prompts: ReleasedPrompt[] = [];
  for (const name of names) {
    const text = texts[name];
    if (text === undefined) {
      return null;
    }
    prompts.push({ name, text });
  }
  return prompts;
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
    return {
      skills: skillNames.map((name) => ({
        name,
        manifest: manifests[name] ?? null,
      })),
      prompts: texts === null ? null : promptsOf(promptNames, texts),
    };
  };
