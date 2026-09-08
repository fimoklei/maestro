// What the latest release ships, read from git rather than from the working
// tree: Inventory describes what a consumer can deploy (ADR-0021 §7).
import type { HarnessTag } from "../harness/read-harness-state";
import { highestReleaseTag } from "../harness/release-tag";
import type { HarnessSkillTree } from "../harness/skill-movements";

// `manifest` is the raw SKILL.md at the release, or null where that release
// ships the directory without one. Parsing stays in the reader.
export type ReleasedSkill = { name: string; manifest: string | null };

// Null is a release that could not be read — never a harness with no release.
// An empty array is only ever "looked, found none".
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
