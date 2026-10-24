import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { HarnessFetchGate } from "./harness-fetch-gate";
import { InMemoryHarnessGit } from "./harness-git.fake";
import { PublishRelease, type ReleaseConfirmation } from "./publish-release";
import type {
  HarnessFreshness,
  ReleasePlan,
  ReleasePlanResult,
} from "./read-harness-state";

const AT = new Date("2026-08-04T12:00:00.000Z");

const FRESHNESS: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-01T07:00:00.000Z",
};

// A gate a Drift or Harness read shares with the release.
const readGate = (git: InMemoryHarnessGit) =>
  new HarnessFetchGate({
    git,
    freshness: { read: async () => FRESHNESS, record: async () => {} },
    now: () => AT,
  });

// Distinct from the world in every field a stale dialog would still show.
const RECOMPUTED: ReleasePlan = {
  delta: [],
  previousTag: "v1.3.0",
  previousTagCommit: "moved",
  proposedStep: "patch",
  reason: "Nothing has changed since the last release.",
  versions: { major: "v2.0.0", minor: "v1.4.0", patch: "v1.3.1" },
  revision: "moved",
  defaultBranch: "main",
  findings: [],
  blocked: "empty-delta",
};

// Both travel so a remote that moved under either one is refused.
const CONFIRMED: ReleaseConfirmation = {
  step: "patch",
  previousTag: "v1.2.3",
  previousTagCommit: "old",
  revision: "head",
};

// v1.2.3 tags `old`; origin/HEAD `head` added `research` since.
const releasable = (
  atHead: Record<string, string> = { research: "new" },
  rootFiles?: string[],
) => {
  const git = new InMemoryHarnessGit();
  git.commit("old", {});
  git.commit("head", atHead, {
    parent: "old",
    ...(rootFiles === undefined ? {} : { rootFiles }),
  });
  git.tip = "head";
  git.head = "head";
  git.tags = [{ name: "v1.2.3", commit: "old" }];
  return git;
};

function buildPublish(
  git: InMemoryHarnessGit,
  overrides?: {
    root?: string | undefined;
    onFreshnessRecord?: (root: string, freshness: HarnessFreshness) => void;
    replan?: (root: string) => Promise<ReleasePlanResult>;
    fetchGate?: HarnessFetchGate;
  },
) {
  return new PublishRelease({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    locks: new InFlightLocks(),
    replan: overrides?.replan ?? (async () => ({ ok: true, plan: RECOMPUTED })),
    git,
    fetchGate:
      overrides?.fetchGate ??
      new HarnessFetchGate({
        git,
        freshness: {
          read: async () => FRESHNESS,
          record: async (root, freshness) => {
            overrides?.onFreshnessRecord?.(root, freshness);
          },
        },
        now: () => AT,
      }),
  });
}

describe("PublishRelease", () => {
  it("refuses when no harness is connected", async () => {
    const publish = buildPublish(releasable(), { root: undefined });

    await expect(publish.execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses an origin apm could never resolve", async () => {
    const git = releasable();
    git.originUrl = "/srv/mirror.git";

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });

  it("has no answer when the confirmation's own fetch cannot reach the remote", async () => {
    const git = releasable();
    git.fetchOutcomes = ["offline"];

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when the default branch tip could not be read", async () => {
    const git = releasable();
    git.tip = null;

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when the release tags could not be read", async () => {
    const git = releasable();
    git.tags = null;

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when the default branch could not be named", async () => {
    const git = releasable();
    git.defaultBranch = null;

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("tags the freshly read revision with the chosen step's version", async () => {
    const git = releasable();

    const result = await buildPublish(git).execute({
      ...CONFIRMED,
      step: "minor",
    });

    expect(result).toEqual({ ok: true, tag: "v1.3.0", revision: "head" });
    expect(git.published).toEqual([
      { name: "v1.3.0", commit: "head", branch: "main" },
    ]);
  });

  it("proposes v0.1.0-style versions for a never-released harness", async () => {
    const git = releasable();
    git.tags = [];

    await expect(
      buildPublish(git).execute({
        ...CONFIRMED,
        step: "minor",
        previousTag: null,
        previousTagCommit: null,
      }),
    ).resolves.toEqual({
      ok: true,
      tag: "v0.1.0",
      revision: "head",
    });
  });

  it("records its own fetch's freshness, not the plan's", async () => {
    const records: { root: string; freshness: HarnessFreshness }[] = [];
    const publish = buildPublish(releasable(), {
      onFreshnessRecord: (root, freshness) => records.push({ root, freshness }),
    });

    await publish.execute(CONFIRMED);

    expect(records).toEqual([
      {
        root: "/harness",
        freshness: { outcome: "fetched", lastFetchedAt: AT.toISOString() },
      },
    ]);
  });

  it("reports someone else's race to the same version as already released", async () => {
    const git = releasable();
    git.publishOutcome = "already-exists";

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "already-released",
      recomputed: RECOMPUTED,
    });
  });

  it("has no answer when the push itself cannot reach the remote", async () => {
    const git = releasable();
    git.publishOutcome = "offline";

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("reports any other push refusal as a failed publish, recomputing nothing it did not cause", async () => {
    const git = releasable();
    git.publishOutcome = "push-failed";

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "publish-failed",
    });
  });

  it("refuses a release whose branch tip moved between the read and the push", async () => {
    // `--atomic` means nothing was created (#520).
    const git = releasable();
    git.publishOutcome = "stale-tip";

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
      recomputed: RECOMPUTED,
    });
  });

  it("refuses a plan whose previous tag no longer matches the freshly read remote", async () => {
    const git = releasable();
    git.tags = [{ name: "v1.3.0", commit: "new" }];

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
      recomputed: RECOMPUTED,
    });
  });

  it("refuses a plan whose revision the default branch has already moved past", async () => {
    const git = releasable();
    git.commit("moved", { research: "newer" }, { parent: "head" });
    git.tip = "moved";

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
      recomputed: RECOMPUTED,
    });
    expect(git.published).toEqual([]);
  });

  it("refuses a plan whose previous tag was force-moved to another commit", async () => {
    // The tag name is unchanged but now points elsewhere (#521).
    const git = releasable();
    git.tags = [{ name: "v1.2.3", commit: "moved" }];

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
      recomputed: RECOMPUTED,
    });
    expect(git.published).toEqual([]);
  });

  it("refuses a plan whose proposed version the remote already carries", async () => {
    const git = releasable();
    git.tags = [
      { name: "v1.2.3", commit: "old" },
      { name: "v1.2.4", commit: "taken" },
    ];

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
      recomputed: RECOMPUTED,
    });
    expect(git.published).toEqual([]);
  });

  it("fetches again before recomputing, so the refused plan is not handed back", async () => {
    // The local refs are already behind; a recompute would repeat the refused plan.
    const git = releasable();
    git.publishOutcome = "stale-tip";

    await buildPublish(git).execute(CONFIRMED);

    expect(git.fetches).toBe(2);
  });

  it("recomputes a pre-push refusal from the refs it already fetched", async () => {
    const git = releasable();
    git.commit("moved", { research: "newer" }, { parent: "head" });
    git.tip = "moved";

    await buildPublish(git).execute(CONFIRMED);

    expect(git.fetches).toBe(1);
  });

  it("recomputes nothing when the fetch behind the refusal could not reach the remote", async () => {
    // `planRelease` reads local refs, so it cannot notice this itself (#521).
    const git = releasable();
    git.publishOutcome = "stale-tip";
    git.fetchOutcomes = ["fetched", "offline"];

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
    });
  });

  it("recomputes against the harness it locked, not whichever is connected now", async () => {
    const roots: string[] = [];
    const git = releasable();
    git.publishOutcome = "stale-tip";
    const publish = buildPublish(git, {
      replan: async (root) => {
        roots.push(root);
        return { ok: true, plan: RECOMPUTED };
      },
    });

    await publish.execute(CONFIRMED);

    expect(roots).toEqual(["/harness"]);
  });

  it("still refuses when the recompute itself has no answer", async () => {
    const git = releasable();
    git.publishOutcome = "stale-tip";
    const publish = buildPublish(git, {
      replan: async () => ({ ok: false, error: "no-answer" }),
    });

    await expect(publish.execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
    });
  });

  it("refuses to publish a release with nothing to release, and pushes no tag", async () => {
    const git = releasable({});

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "empty-delta",
      recomputed: RECOMPUTED,
    });
    expect(git.published).toEqual([]);
  });

  it("refuses a commit with a SKILL.md at the root, and pushes no tag", async () => {
    const git = releasable(undefined, ["SKILL.md", "apm.yml"]);

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "root-skill-file",
      recomputed: RECOMPUTED,
    });
    expect(git.published).toEqual([]);
  });

  it("publishes a release whose root holds files other than SKILL.md", async () => {
    const git = releasable(undefined, ["README.md", "apm.yml"]);

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: true,
      tag: "v1.2.4",
      revision: "head",
    });
  });

  it("has no answer when the root of the commit could not be listed", async () => {
    const git = releasable();
    git.unlistableRoots.add("head");

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(git.published).toEqual([]);
  });

  it("publishes again once the root SKILL.md is gone from the default branch", async () => {
    const git = new InMemoryHarnessGit();
    git.commit("old", {});
    git.commit(
      "stray",
      { research: "new" },
      { parent: "old", rootFiles: ["SKILL.md"] },
    );
    git.commit("head", { research: "new" }, { parent: "stray" });
    git.tip = "head";
    git.tags = [{ name: "v1.2.3", commit: "old" }];

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: true,
      tag: "v1.2.4",
      revision: "head",
    });
  });

  it("publishes a release whose only change is a prompt", async () => {
    const git = new InMemoryHarnessGit();
    git.commit("old", {});
    git.commit("head", {}, { parent: "old", prompts: { "pr-review": "v2" } });
    git.tip = "head";
    git.head = "head";
    git.tags = [{ name: "v1.2.3", commit: "old" }];

    await expect(buildPublish(git).execute(CONFIRMED)).resolves.toEqual({
      ok: true,
      tag: "v1.2.4",
      revision: "head",
    });
  });

  it("refuses a second confirmation for the same harness while one is already running", async () => {
    let releaseFetch = () => {};
    const git = releasable();
    git.fetchHold = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const publish = buildPublish(git);

    const first = publish.execute(CONFIRMED);
    const second = await publish.execute(CONFIRMED);

    expect(second).toEqual({ ok: false, error: "publish-in-progress" });
    releaseFetch();
    await expect(first).resolves.toEqual({
      ok: true,
      tag: "v1.2.4",
      revision: "head",
    });
  });
  it("fetches before publishing even right after a read reused within its window", async () => {
    const git = releasable();
    const gate = readGate(git);
    await gate.fetchRecent("/harness");

    await buildPublish(git, { fetchGate: gate }).execute(CONFIRMED);

    expect(git.fetches).toBe(2);
  });

  it("makes the next read fetch after a release, even within its window", async () => {
    const git = releasable();
    const gate = readGate(git);
    await gate.fetchRecent("/harness");
    await buildPublish(git, { fetchGate: gate }).execute(CONFIRMED);

    await gate.fetchRecent("/harness");

    expect(git.fetches).toBe(3);
  });
});
