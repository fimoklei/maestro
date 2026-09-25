import { describe, expect, it } from "vitest";
import type { HarnessTag } from "../harness/read-harness-state";
import type { HarnessSkillTree } from "../harness/skill-movements";
import { releasedSkillsFromGit } from "./released-skills";

const ROOT = "/inv";

type GitStub = {
  tags?: HarnessTag[] | null;
  trees?: HarnessSkillTree[] | null;
  manifests?: Record<string, string | null>;
  seen?: { tag?: string; names?: string[] };
};

const gitOver = (stub: GitStub) => ({
  readTags: async () => (stub.tags === undefined ? [] : stub.tags),
  readSkillTreesAtTag: async (_root: string, tag: string) => {
    if (stub.seen) stub.seen.tag = tag;
    return stub.trees === undefined ? [] : stub.trees;
  },
  readSkillManifestsAtTag: async (
    _root: string,
    _tag: string,
    names: string[],
  ) => {
    if (stub.seen) stub.seen.names = names;
    return stub.manifests ?? {};
  },
});

describe("releasedSkillsFromGit", () => {
  it("reads the highest release tag's skills with their manifests", async () => {
    const seen: GitStub["seen"] = {};
    const read = releasedSkillsFromGit(
      gitOver({
        tags: [
          { name: "v0.9.0", commit: "a" },
          { name: "v0.10.0", commit: "b" },
          { name: "not-a-release", commit: "c" },
        ],
        trees: [
          { name: "tdd", treeHash: "t1" },
          { name: "diagnose", treeHash: "t2" },
        ],
        manifests: { tdd: "tdd manifest", diagnose: "diagnose manifest" },
        seen,
      }),
    );

    await expect(read(ROOT)).resolves.toEqual([
      { name: "tdd", manifest: "tdd manifest" },
      { name: "diagnose", manifest: "diagnose manifest" },
    ]);
    expect(seen.tag).toBe("v0.10.0");
    expect(seen.names).toEqual(["tdd", "diagnose"]);
  });

  it("reads a released skill with no manifest as a skill without one", async () => {
    const read = releasedSkillsFromGit(
      gitOver({
        tags: [{ name: "v1.0.0", commit: "a" }],
        trees: [{ name: "tdd", treeHash: "t1" }],
        manifests: {},
      }),
    );

    await expect(read(ROOT)).resolves.toEqual([
      { name: "tdd", manifest: null },
    ]);
  });

  it("reads a harness with no release tag as no released skills", async () => {
    const read = releasedSkillsFromGit(gitOver({ tags: [] }));

    await expect(read(ROOT)).resolves.toEqual([]);
  });

  it("reads a release carrying no skills as no released skills", async () => {
    const read = releasedSkillsFromGit(
      gitOver({ tags: [{ name: "v1.0.0", commit: "a" }], trees: [] }),
    );

    await expect(read(ROOT)).resolves.toEqual([]);
  });

  // Null is unreadable, never "never released".
  it("reports unreadable when the tag namespace cannot be read", async () => {
    const read = releasedSkillsFromGit(gitOver({ tags: null }));

    await expect(read(ROOT)).resolves.toBeNull();
  });

  it("reports unreadable when the release's tree cannot be read", async () => {
    const read = releasedSkillsFromGit(
      gitOver({ tags: [{ name: "v1.0.0", commit: "a" }], trees: null }),
    );

    await expect(read(ROOT)).resolves.toBeNull();
  });
});
