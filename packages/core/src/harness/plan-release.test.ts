import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "./harness-git.fake";
import type { HarnessFreshness } from "./read-harness-state";
import { ReadHarnessState } from "./read-harness-state";

const FETCHED: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-01T07:00:00.000Z",
};

const manifest = (name: string, body = "Body") =>
  `---\ndescription: ${name} does a thing\n---\n${body}\n`;

// v1.2.3 tags `old`; origin/HEAD is `head`.
const releasedAt = (
  atRelease: Record<string, string | null>,
  atHead: Record<string, string | null>,
) => {
  const git = new InMemoryHarnessGit();
  git.commit("old", atRelease);
  git.commit("head", atHead, { parent: "old" });
  git.tip = "head";
  git.head = "head";
  git.working = { ...atHead };
  git.tags = [{ name: "v1.2.3", commit: "old" }];
  return git;
};

function buildRead(
  git: InMemoryHarnessGit,
  overrides?: { root?: string | undefined; freshness?: HarnessFreshness },
) {
  return new ReadHarnessState({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    git,
    review: {
      readReviews: async () =>
        ({
          outcome: "read",
          requests: [],
          complete: true,
          limit: 100,
        }) as const,
      readViewer: async () => ({ outcome: "read", login: "fimoklei" }) as const,
    },
    freshness: {
      read: async () => overrides?.freshness ?? FETCHED,
      record: async () => {},
    },
  });
}

describe("ReadHarnessState.planRelease", () => {
  it("plans the delta, previous tag, revision, and default branch", async () => {
    const git = new InMemoryHarnessGit();
    git.commit("old", { tdd: manifest("tdd") });
    git.commit(
      "edit",
      { tdd: manifest("tdd", "v2") },
      {
        parent: "old",
        author: "Ada",
      },
    );
    git.commit(
      "head",
      { tdd: manifest("tdd", "v2"), research: manifest("research") },
      { parent: "edit", author: "Grace" },
    );
    git.tip = "head";
    git.head = "head";
    git.tags = [{ name: "v1.2.3", commit: "old" }];

    await expect(buildRead(git).planRelease()).resolves.toMatchObject({
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

  it("names a removal's author from the release when the branch never had it", async () => {
    // A tag on another history: a log at the branch answers nothing.
    const git = new InMemoryHarnessGit();
    git.commit("old", { grilling: manifest("grilling") }, { author: "Linus" });
    git.commit("head", {});
    git.tip = "head";
    git.head = "head";
    git.tags = [{ name: "v1.2.3", commit: "old" }];

    await expect(buildRead(git).planRelease()).resolves.toMatchObject({
      ok: true,
      plan: { delta: [{ kind: "removed", name: "grilling", author: "Linus" }] },
    });
  });

  it("proposes v0.1.0 for a never-released harness", async () => {
    const git = releasedAt({}, { tdd: manifest("tdd") });
    git.tags = [];

    await expect(buildRead(git).planRelease()).resolves.toMatchObject({
      ok: true,
      plan: {
        previousTag: null,
        proposedStep: "minor",
        versions: { minor: "v0.1.0" },
      },
    });
  });

  it("reports one advisory finding per structurally broken skill at origin/HEAD", async () => {
    const git = releasedAt(
      {},
      {
        good: manifest("good"),
        nomanifest: null,
        blankdesc: "---\ndescription: '  '\n---\n",
      },
    );

    await expect(buildRead(git).planRelease()).resolves.toMatchObject({
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
    const read = buildRead(releasedAt({}, {}), {
      freshness: { outcome: null, lastFetchedAt: null },
    });

    await expect(read.planRelease()).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when the default branch could not be read", async () => {
    const git = releasedAt({}, {});
    git.defaultBranch = null;
    git.tip = null;

    await expect(buildRead(git).planRelease()).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when a skill tree could not be read", async () => {
    const git = releasedAt({}, {});
    git.unreadable.add("head");

    await expect(buildRead(git).planRelease()).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when the release tags could not be read", async () => {
    // An unreadable tag namespace is not an unreleased harness (#519).
    const git = releasedAt({}, {});
    git.tags = null;

    await expect(buildRead(git).planRelease()).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("reads origin/HEAD's skills once, so the delta and the checks agree", async () => {
    // A failed second read once reported "no advisories" for checks never run.
    const git = releasedAt({}, { tdd: manifest("tdd") });

    await buildRead(git).planRelease();

    expect(git.treeReads.filter((ref) => ref === "head")).toHaveLength(1);
  });

  it("refuses when no harness is connected", async () => {
    const read = buildRead(releasedAt({}, {}), { root: undefined });

    await expect(read.planRelease()).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses an origin apm could never resolve", async () => {
    const git = releasedAt({}, {});
    git.originUrl = "/srv/mirror.git";

    await expect(buildRead(git).planRelease()).resolves.toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });
});
