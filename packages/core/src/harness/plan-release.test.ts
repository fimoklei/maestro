import { describe, expect, it } from "vitest";
import type {
  HarnessFacts,
  HarnessFreshness,
  HarnessSkillTrees,
} from "./read-harness-state";
import { ReadHarnessState } from "./read-harness-state";
import type { HarnessSkillTree } from "./skill-movements";

const FETCHED: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-01T07:00:00.000Z",
};

const FACTS: HarnessFacts = {
  originUrl: "git@github.com:fimoklei/agent-harness.git",
  defaultBranch: "main",
  defaultBranchCommit: "head",
  tags: [{ name: "v1.2.3", commit: "old" }],
};

const SETTLED_TREES: HarnessSkillTrees = {
  remote: {},
  promote: {},
  local: {},
  working: {},
};

const goodManifest = (name: string) =>
  `---\ndescription: ${name} does a thing\n---\nBody\n`;

type TreesByRef = Record<string, HarnessSkillTree[] | null>;

function buildRead(overrides?: {
  facts?: Partial<HarnessFacts>;
  root?: string | undefined;
  freshness?: HarnessFreshness;
  trees?: TreesByRef;
  authors?: Record<string, string>;
  manifests?: Record<string, string | null>;
  onReadSkillTrees?: (ref: string) => void;
}) {
  return new ReadHarnessState({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    git: {
      fetch: async () => "fetched",
      readFacts: async () => ({ ...FACTS, ...overrides?.facts }),
      readSkillTrees: async (_root: string, ref: string) => {
        overrides?.onReadSkillTrees?.(ref);
        return overrides?.trees?.[ref] === undefined
          ? []
          : overrides.trees[ref];
      },
      readSkillAuthors: async (_root: string, _ref: string, names: string[]) =>
        Object.fromEntries(
          names.map((name) => [name, overrides?.authors?.[name] ?? null]),
        ),
      readMovementTrees: async () => SETTLED_TREES,
      mergeBaseCommit: async () => null,
      readSkillManifests: async (
        _root: string,
        _ref: string,
        names: string[],
      ) =>
        Object.fromEntries(
          names.map((name) => [
            name,
            overrides?.manifests && Object.hasOwn(overrides.manifests, name)
              ? (overrides.manifests[name] ?? null)
              : goodManifest(name),
          ]),
        ),
      publishTag: async () => {
        throw new Error("git port's publishTag was reached");
      },
      // Reading state never promotes; reaching this would mean a read wrote.
      pushSkillPromotion: async () => {
        throw new Error("git port's pushSkillPromotion was reached");
      },
    },
    freshness: {
      read: async () => overrides?.freshness ?? FETCHED,
      record: async () => {},
    },
  });
}

describe("ReadHarnessState.planRelease", () => {
  it("plans the delta, previous tag, revision, and default branch", async () => {
    const read = buildRead({
      trees: {
        old: [{ name: "tdd", treeHash: "t1" }],
        head: [
          { name: "tdd", treeHash: "t2" },
          { name: "research", treeHash: "r1" },
        ],
      },
      authors: { tdd: "Ada", research: "Grace" },
    });

    const result = await read.planRelease();

    expect(result).toMatchObject({
      ok: true,
      plan: {
        previousTag: "v1.2.3",
        revision: "head",
        defaultBranch: "main",
        proposedStep: "minor",
        versions: { major: "v2.0.0", minor: "v1.3.0", patch: "v1.2.4" },
        delta: [
          { kind: "added", name: "research", author: "Grace" },
          { kind: "changed", name: "tdd", author: "Ada" },
        ],
        findings: [],
      },
    });
  });

  it("proposes v0.1.0 for a never-released harness", async () => {
    const read = buildRead({
      facts: { tags: [] },
      trees: { head: [{ name: "tdd", treeHash: "t1" }] },
    });

    await expect(read.planRelease()).resolves.toMatchObject({
      ok: true,
      plan: {
        previousTag: null,
        proposedStep: "minor",
        versions: { minor: "v0.1.0" },
      },
    });
  });

  it("reports one advisory finding per structurally broken skill at origin/HEAD", async () => {
    const read = buildRead({
      trees: {
        old: [],
        head: [
          { name: "good", treeHash: "g" },
          { name: "nomanifest", treeHash: "n" },
          { name: "blankdesc", treeHash: "b" },
        ],
      },
      manifests: {
        nomanifest: null,
        blankdesc: "---\ndescription: '  '\n---\n",
      },
    });

    const result = await read.planRelease();

    expect(result).toMatchObject({
      ok: true,
      plan: {
        findings: [
          { skill: "blankdesc", problem: "empty-description" },
          { skill: "nomanifest", problem: "missing-manifest" },
        ],
      },
    });
  });

  it("has no answer when no fetch has confirmed the remote", async () => {
    const read = buildRead({
      freshness: { outcome: null, lastFetchedAt: null },
    });

    await expect(read.planRelease()).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when the default branch could not be read", async () => {
    const read = buildRead({
      facts: { defaultBranch: null, defaultBranchCommit: null },
    });

    await expect(read.planRelease()).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when a skill tree could not be read", async () => {
    const read = buildRead({ trees: { head: null } });

    await expect(read.planRelease()).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when the release tags could not be read", async () => {
    // An unreadable tag namespace is not an unreleased harness: planning from
    // it would propose v0.1.0 over a release that already exists (#519).
    const read = buildRead({ facts: { tags: null } });

    await expect(read.planRelease()).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("reads origin/HEAD's skills once, so the delta and the checks agree", async () => {
    // Two reads of the same ref can disagree, and a failed second read once
    // reported "no advisories" for checks that never ran.
    const refs: string[] = [];
    const read = buildRead({
      trees: { old: [], head: [{ name: "tdd", treeHash: "t1" }] },
      onReadSkillTrees: (ref) => refs.push(ref),
    });

    await read.planRelease();

    expect(refs.filter((ref) => ref === "head")).toHaveLength(1);
  });

  it("refuses when no harness is connected", async () => {
    const read = buildRead({ root: undefined });

    await expect(read.planRelease()).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses an origin apm could never resolve", async () => {
    const read = buildRead({ facts: { originUrl: "/srv/mirror.git" } });

    await expect(read.planRelease()).resolves.toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });
});
