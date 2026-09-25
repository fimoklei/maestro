// Read from git, never the working tree: Inventory shows what can be deployed.
import type { HarnessTag } from "../harness/read-harness-state";
import { highestReleaseTag } from "../harness/release-tag";
import type { HarnessSkillTree } from "../harness/skill-movements";

// `manifest` is the raw SKILL.md, or null where the release ships none.
export type ReleasedSkill = { name: string; manifest: string | null };

// Null is an unreadable release; an empty array is "looked, found none".
export type ReadReleasedSkills = (
  root: string,
) => Promise<ReleasedSkill[] | null>;

type ReleasedSkillsGitPort = {
  readTags(root: string): Promise<HarnessTag[] | null>;
  readSkillTreesAtTag(
    root: string,
    tag: string,
  ): Promise<HarnessSkillTree[] | null>;
  readSkillManifestsAtTag(
    root: string,
    tag: string,
    names: string[],
  ): Promise<Record<string, string | null>>;
};

export const releasedSkillsFromGit =
  (git: ReleasedSkillsGitPort): ReadReleasedSkills =>
  async (root) => {
    const tags = await git.readTags(root);
    if (tags === null) {
      return null;
    }
    const tag = highestReleaseTag(tags);
    if (tag === null) {
      return [];
    }
    const trees = await git.readSkillTreesAtTag(root, tag.name);
    if (trees === null) {
      return null;
    }
    const names = trees.map((tree) => tree.name);
    const manifests = await git.readSkillManifestsAtTag(root, tag.name, names);
    return names.map((name) => ({ name, manifest: manifests[name] ?? null }));
  };
