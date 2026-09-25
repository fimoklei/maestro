import { describe, expect, it } from "vitest";
import type { HarnessTag } from "../harness/read-harness-state";
import type { HarnessSkillTree } from "../harness/skill-movements";
import { ReleaseHeadReader } from "./release-head";

const tags = (...names: string[]): HarnessTag[] =>
  names.map((name) => ({ name, commit: name }));

const trees = (content: Record<string, string>): HarnessSkillTree[] =>
  Object.entries(content).map(([name, treeHash]) => ({ name, treeHash }));

const AT = new Date("2026-09-12T10:00:00.000Z");

function reader(git: {
  readTags?: () => Promise<HarnessTag[] | null>;
  readSkillTreesAtTag?: (
    root: string,
    tag: string,
  ) => Promise<HarnessSkillTree[] | null>;
  root?: string | undefined;
}) {
  return new ReleaseHeadReader({
    git: {
      readTags: git.readTags ?? (async () => tags("v0.3.2", "v0.3.4")),
      readSkillTreesAtTag: git.readSkillTreesAtTag ?? (async () => []),
    },
    resolveRoot: async () => ("root" in git ? git.root : "/harness"),
    now: () => AT,
  });
}

const TREES: Record<string, HarnessSkillTree[]> = {
  "v0.3.2": trees({ tdd: "a", grill: "b", jobs: "c", review: "d", brief: "e" }),
  "v0.3.4": trees({
    tdd: "a2",
    grill: "b",
    jobs: "c2",
    review: "d",
    brief: "e",
  }),
};

const SELECTION = ["tdd", "grill", "jobs", "review", "brief"];

describe("ReleaseHeadReader", () => {
  it("counts only the selection's changed skills against the latest release", async () => {
    const head = await reader({
      readSkillTreesAtTag: async (_root, tag) => TREES[tag] ?? null,
    }).read({ key: "/repo", release: "v0.3.2", selection: SELECTION });

    expect(head).toStrictEqual({
      release: "v0.3.2",
      latestRelease: "v0.3.4",
      changed: 2,
      changedSkills: ["tdd", "jobs"],
      selection: SELECTION,
      selected: 5,
      comparedAt: AT.toISOString(),
    });
  });

  it("names the changed skills in the selection's own order", async () => {
    const head = await reader({
      readSkillTreesAtTag: async (_root, tag) => TREES[tag] ?? null,
    }).read({
      key: "/repo",
      release: "v0.3.2",
      selection: ["jobs", "grill", "tdd"],
    });

    expect(head.changedSkills).toEqual(["jobs", "tdd"]);
  });

  it("names no changed skill for a target on the latest release", async () => {
    const head = await reader({
      readSkillTreesAtTag: async (_root, tag) => TREES[tag] ?? null,
    }).read({ key: "/repo", release: "v0.3.4", selection: SELECTION });

    expect(head.changedSkills).toEqual([]);
  });

  it("names no changed skills at all when the comparison could not be read", async () => {
    const head = await reader({
      readSkillTreesAtTag: async () => null,
    }).read({ key: "/repo", release: "v0.3.2", selection: SELECTION });

    expect(head.changedSkills).toBeUndefined();
  });

  it("leaves a changed skill outside the selection out of the count", async () => {
    const head = await reader({
      readSkillTreesAtTag: async (_root, tag) => TREES[tag] ?? null,
    }).read({
      key: "/repo",
      release: "v0.3.2",
      selection: ["grill", "review"],
    });

    expect(head.changed).toBe(0);
    expect(head.selected).toBe(2);
  });

  it("reads a target on the latest release as in sync", async () => {
    const head = await reader({
      readSkillTreesAtTag: async (_root, tag) => TREES[tag] ?? null,
    }).read({ key: "/repo", release: "v0.3.4", selection: SELECTION });

    expect(head).toStrictEqual({
      release: "v0.3.4",
      latestRelease: "v0.3.4",
      changed: 0,
      changedSkills: [],
      selection: SELECTION,
      selected: 5,
      comparedAt: AT.toISOString(),
    });
  });

  it("counts a selected skill the newer release dropped as changed", async () => {
    const head = await reader({
      readSkillTreesAtTag: async (_root, tag) =>
        tag === "v0.3.4" ? trees({ tdd: "a" }) : trees({ tdd: "a", gone: "z" }),
    }).read({ key: "/repo", release: "v0.3.2", selection: ["tdd", "gone"] });

    expect(head.changed).toBe(1);
  });

  it("reports no count when the Harness content cannot be read", async () => {
    const head = await reader({
      readSkillTreesAtTag: async () => null,
    }).read({ key: "/repo", release: "v0.3.2", selection: SELECTION });

    expect(head).toStrictEqual({
      release: "v0.3.2",
      latestRelease: "v0.3.4",
      changed: null,
      selection: SELECTION,
      selected: 5,
      comparedAt: null,
    });
  });

  it("keeps the last successful read time when a later comparison fails", async () => {
    let readable = true;
    const head = reader({
      readSkillTreesAtTag: async (_root, tag) =>
        readable ? (TREES[tag] ?? null) : null,
    });

    await head.read({ key: "/repo", release: "v0.3.2", selection: SELECTION });
    readable = false;

    await expect(
      head.read({ key: "/repo", release: "v0.3.2", selection: SELECTION }),
    ).resolves.toStrictEqual({
      release: "v0.3.2",
      latestRelease: "v0.3.4",
      changed: null,
      selection: SELECTION,
      selected: 5,
      comparedAt: AT.toISOString(),
    });
  });

  it("keeps one target's read time out of another's", async () => {
    const head = reader({
      readSkillTreesAtTag: async (_root, tag) => TREES[tag] ?? null,
    });

    await head.read({ key: "/repo", release: "v0.3.2", selection: SELECTION });

    await expect(
      head.read({ key: "/other", release: "v0.3.2", selection: [] }),
    ).resolves.toMatchObject({ comparedAt: AT.toISOString(), changed: 0 });
  });

  it("names both releases when the tags are read but the trees are not", async () => {
    const head = await reader({
      readTags: async () => tags("v0.3.2", "v0.3.4"),
      readSkillTreesAtTag: async () => null,
    }).read({ key: "/repo", release: "v0.3.2", selection: SELECTION });

    expect(head.release).toBe("v0.3.2");
    expect(head.latestRelease).toBe("v0.3.4");
  });

  it("names no latest release when the Harness is not connected", async () => {
    const head = await reader({ root: undefined }).read({
      key: "/repo",
      release: "v0.3.2",
      selection: SELECTION,
    });

    expect(head).toStrictEqual({
      release: "v0.3.2",
      latestRelease: null,
      changed: null,
      selection: SELECTION,
      selected: 5,
      comparedAt: null,
    });
  });

  it("names no latest release when the Harness has published none", async () => {
    const head = await reader({ readTags: async () => [] }).read({
      key: "/repo",
      release: "v0.3.2",
      selection: SELECTION,
    });

    expect(head.latestRelease).toBeNull();
    expect(head.changed).toBeNull();
  });

  it("gives no count for a pin that is not a release tag", async () => {
    const head = await reader({
      readSkillTreesAtTag: async (_root, tag) => TREES[tag] ?? null,
    }).read({ key: "/repo", release: "main", selection: SELECTION });

    expect(head.changed).toBeNull();
    expect(head.latestRelease).toBe("v0.3.4");
  });

  it("survives a git read that rejects", async () => {
    const head = await reader({
      readTags: async () => {
        throw new Error("no clone");
      },
    }).read({ key: "/repo", release: "v0.3.2", selection: SELECTION });

    expect(head.changed).toBeNull();
    expect(head.latestRelease).toBeNull();
  });
});
