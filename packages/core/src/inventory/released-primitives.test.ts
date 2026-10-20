import { describe, expect, it } from "vitest";
import { releasedPrimitivesFromGit } from "./released-primitives";

const ROOT = "/inv";

type ReleasedGit = Parameters<typeof releasedPrimitivesFromGit>[0];
type HarnessTag = NonNullable<
  Awaited<ReturnType<ReleasedGit["readTags"]>>
>[number];
type HarnessObject = NonNullable<
  Awaited<ReturnType<ReleasedGit["readPrimitivesAtTag"]>>
>[number];

type GitStub = {
  tags?: HarnessTag[] | null;
  objects?: HarnessObject[] | null;
  manifests?: Record<string, string | null>;
  texts?: Record<string, string> | null;
  seen?: { tag?: string; skills?: string[]; prompts?: string[] };
};

const gitOver = (stub: GitStub) => ({
  readTags: async () => (stub.tags === undefined ? [] : stub.tags),
  readPrimitivesAtTag: async (_root: string, tag: string) => {
    if (stub.seen) stub.seen.tag = tag;
    return stub.objects === undefined ? [] : stub.objects;
  },
  readSkillManifestsAtTag: async (
    _root: string,
    _tag: string,
    names: string[],
  ) => {
    if (stub.seen) stub.seen.skills = names;
    return stub.manifests ?? {};
  },
  readPromptTextsAtTag: async (
    _root: string,
    _tag: string,
    names: string[],
  ) => {
    if (stub.seen) stub.seen.prompts = names;
    return stub.texts === undefined ? {} : stub.texts;
  },
});

const skill = (name: string): HarnessObject => ({
  type: "skill",
  name,
  hash: `t-${name}`,
});
const prompt = (name: string): HarnessObject => ({
  type: "prompt",
  name,
  hash: `b-${name}`,
});

const RELEASED = [{ name: "v1.0.0", commit: "a" }];

describe("releasedPrimitivesFromGit", () => {
  it("reads the highest release tag's skills and prompts with their files", async () => {
    const seen: GitStub["seen"] = {};
    const read = releasedPrimitivesFromGit(
      gitOver({
        tags: [
          { name: "v0.9.0", commit: "a" },
          { name: "v0.10.0", commit: "b" },
          { name: "not-a-release", commit: "c" },
        ],
        objects: [skill("tdd"), skill("diagnose"), prompt("pr-review")],
        manifests: { tdd: "tdd manifest", diagnose: "diagnose manifest" },
        texts: { "pr-review": "review text" },
        seen,
      }),
    );

    await expect(read(ROOT)).resolves.toEqual({
      skills: [
        { name: "tdd", manifest: "tdd manifest" },
        { name: "diagnose", manifest: "diagnose manifest" },
      ],
      prompts: [{ name: "pr-review", text: "review text" }],
    });
    expect(seen).toEqual({
      tag: "v0.10.0",
      skills: ["tdd", "diagnose"],
      prompts: ["pr-review"],
    });
  });

  it("reads a released skill with no manifest as a skill without one", async () => {
    const read = releasedPrimitivesFromGit(
      gitOver({ tags: RELEASED, objects: [skill("tdd")], manifests: {} }),
    );

    await expect(read(ROOT)).resolves.toEqual({
      skills: [{ name: "tdd", manifest: null }],
      prompts: [],
    });
  });

  it("reads a harness with no release tag as nothing released", async () => {
    const read = releasedPrimitivesFromGit(gitOver({ tags: [] }));

    await expect(read(ROOT)).resolves.toEqual({ skills: [], prompts: [] });
  });

  // Null is unreadable, never "never released".
  it("reports unreadable when the tag namespace cannot be read", async () => {
    const read = releasedPrimitivesFromGit(gitOver({ tags: null }));

    await expect(read(ROOT)).resolves.toBeNull();
  });

  it("reports unreadable when the release's listing cannot be read", async () => {
    const read = releasedPrimitivesFromGit(
      gitOver({ tags: RELEASED, objects: null }),
    );

    await expect(read(ROOT)).resolves.toBeNull();
  });

  it("reports unreadable when the prompt files cannot be read", async () => {
    const read = releasedPrimitivesFromGit(
      gitOver({ tags: RELEASED, objects: [prompt("pr-review")], texts: null }),
    );

    await expect(read(ROOT)).resolves.toBeNull();
  });

  // A listed prompt with no text would otherwise vanish from the list.
  it("reports unreadable when a listed prompt has no text", async () => {
    const read = releasedPrimitivesFromGit(
      gitOver({
        tags: RELEASED,
        objects: [prompt("pr-review"), prompt("triage")],
        texts: { "pr-review": "review text" },
      }),
    );

    await expect(read(ROOT)).resolves.toBeNull();
  });
});
