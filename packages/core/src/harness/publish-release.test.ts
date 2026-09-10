import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { PublishRelease, type ReleaseConfirmation } from "./publish-release";
import type {
  HarnessFacts,
  HarnessFreshness,
  PublishTagOutcome,
  ReleasePlan,
  ReleasePlanResult,
} from "./read-harness-state";

const AT = new Date("2026-08-04T12:00:00.000Z");

const FACTS: HarnessFacts = {
  originUrl: "git@github.com:fimoklei/agent-harness.git",
  defaultBranch: "main",
  defaultBranchCommit: "head",
  tags: [{ name: "v1.2.3", commit: "old" }],
};

const FRESHNESS: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-01T07:00:00.000Z",
};

// What a replan finds after the refusal: a remote one release further along.
// Distinct from FACTS in every field a stale dialog would still be showing.
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
};

// The plan the author confirmed: the tag and revision their dialog last
// showed. Both travel so a remote that moved under either one is refused.
const CONFIRMED: ReleaseConfirmation = {
  step: "patch",
  previousTag: "v1.2.3",
  previousTagCommit: "old",
  revision: "head",
};

function buildPublish(overrides?: {
  root?: string | undefined;
  facts?: Partial<HarnessFacts>;
  freshness?: HarnessFreshness;
  fetchOutcome?: "fetched" | "offline" | "fetch-failed";
  // One entry per fetch, so a test can let the confirmation's own reach
  // succeed and the one behind the refusal fail.
  fetchOutcomes?: ("fetched" | "offline" | "fetch-failed")[];
  fetchHold?: Promise<void>;
  publishTagOutcome?: PublishTagOutcome;
  onPublishTag?: (name: string, commit: string, branch: string) => void;
  onFreshnessRecord?: (root: string, freshness: HarnessFreshness) => void;
  onFetch?: () => void;
  replan?: (root: string) => Promise<ReleasePlanResult>;
  locks?: InFlightLocks;
}) {
  let fetches = 0;
  return new PublishRelease({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    locks: overrides?.locks ?? new InFlightLocks(),
    replan: overrides?.replan ?? (async () => ({ ok: true, plan: RECOMPUTED })),
    git: {
      fetch: async () => {
        overrides?.onFetch?.();
        await overrides?.fetchHold;
        const scripted = overrides?.fetchOutcomes?.[fetches];
        fetches += 1;
        return scripted ?? overrides?.fetchOutcome ?? "fetched";
      },
      readFacts: async () => ({ ...FACTS, ...overrides?.facts }),
      readSkillTrees: async () => [],
      readSkillAuthors: async () => ({}),
      readMovementTrees: async () => ({
        remote: {},
        promote: {},
        local: {},
        working: {},
      }),
      mergeBaseCommit: async () => null,
      readSkillManifests: async () => ({}),
      publishTag: async (
        _root: string,
        name: string,
        commit: string,
        branch: string,
      ) => {
        overrides?.onPublishTag?.(name, commit, branch);
        return overrides?.publishTagOutcome ?? "pushed";
      },
      // Publishing a release never promotes; reaching this would mean one call
      // took the other's route.
      pushSkillPromotion: async () => {
        throw new Error("git port's pushSkillPromotion was reached");
      },
      pushSkillDeletion: async () => {
        throw new Error("git port's pushSkillDeletion was reached");
      },
      readWorktreeAmbiguity: async () => null,
      readLocalHeadCommit: async () => "local-head",
      readStagedSkillDifference: async () => false,
      writeSkillTreeInto: async () => "written",
    },
    freshness: {
      read: async () => overrides?.freshness ?? FRESHNESS,
      record: async (root, freshness) => {
        overrides?.onFreshnessRecord?.(root, freshness);
      },
    },
  });
}

describe("PublishRelease", () => {
  it("refuses when no harness is connected", async () => {
    const publish = buildPublish({ root: undefined });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses an origin apm could never resolve", async () => {
    const publish = buildPublish({ facts: { originUrl: "/srv/mirror.git" } });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });

  it("has no answer when the confirmation's own fetch cannot reach the remote", async () => {
    const publish = buildPublish({ fetchOutcome: "offline" });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when the default branch tip could not be read", async () => {
    const publish = buildPublish({
      facts: { defaultBranchCommit: null },
    });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when the release tags could not be read", async () => {
    const publish = buildPublish({ facts: { tags: null } });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when the default branch could not be named", async () => {
    const publish = buildPublish({ facts: { defaultBranch: null } });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("tags the freshly read revision with the chosen step's version", async () => {
    const calls: { name: string; commit: string; branch: string }[] = [];
    const publish = buildPublish({
      onPublishTag: (name, commit, branch) =>
        calls.push({ name, commit, branch }),
    });

    const result = await publish.execute({ ...CONFIRMED, step: "minor" }, AT);

    expect(result).toEqual({ ok: true, tag: "v1.3.0", revision: "head" });
    expect(calls).toEqual([{ name: "v1.3.0", commit: "head", branch: "main" }]);
  });

  it("proposes v0.1.0-style versions for a never-released harness", async () => {
    const publish = buildPublish({ facts: { tags: [] } });

    await expect(
      publish.execute(
        {
          ...CONFIRMED,
          step: "minor",
          previousTag: null,
          previousTagCommit: null,
        },
        AT,
      ),
    ).resolves.toEqual({
      ok: true,
      tag: "v0.1.0",
      revision: "head",
    });
  });

  it("records its own fetch's freshness, not the plan's", async () => {
    const records: { root: string; freshness: HarnessFreshness }[] = [];
    const publish = buildPublish({
      onFreshnessRecord: (root, freshness) => records.push({ root, freshness }),
    });

    await publish.execute(CONFIRMED, AT);

    expect(records).toEqual([
      {
        root: "/harness",
        freshness: { outcome: "fetched", lastFetchedAt: AT.toISOString() },
      },
    ]);
  });

  it("reports someone else's race to the same version as already released", async () => {
    // Retryable, not terminal: the name was taken, so what the author needs is
    // the recomputed plan to confirm again — never a dead end (#521).
    const publish = buildPublish({ publishTagOutcome: "already-exists" });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "already-released",
      recomputed: RECOMPUTED,
    });
  });

  it("has no answer when the push itself cannot reach the remote", async () => {
    const publish = buildPublish({ publishTagOutcome: "offline" });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("reports any other push refusal as a failed publish", async () => {
    const publish = buildPublish({ publishTagOutcome: "push-failed" });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "publish-failed",
    });
  });

  it("refuses a release whose branch tip moved between the read and the push", async () => {
    // The lease git refused: what this confirmation read as the tip is not
    // what the remote still has, so the tag would name a commit the branch has
    // already moved past. `--atomic` means nothing was created (#520).
    const publish = buildPublish({ publishTagOutcome: "stale-tip" });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
      recomputed: RECOMPUTED,
    });
  });

  it("refuses a plan whose previous tag no longer matches the freshly read remote", async () => {
    // The remote moved past what the author's dialog last showed them —
    // someone else released, or an earlier retry of this same confirmation
    // already did. Publishing the step blindly would price a second release
    // off a previous tag that no longer exists (#520).
    const publish = buildPublish({
      facts: { tags: [{ name: "v1.3.0", commit: "new" }] },
    });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
      recomputed: RECOMPUTED,
    });
  });

  it("refuses a plan whose revision the default branch has already moved past", async () => {
    // The tip moved between the plan and this confirmation. Tagging the freshly
    // read tip would publish commits the author never saw priced, so the plan is
    // refused rather than quietly re-pointed (#521).
    const calls: string[] = [];
    const publish = buildPublish({
      facts: { defaultBranchCommit: "moved" },
      onPublishTag: (name) => calls.push(name),
    });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
      recomputed: RECOMPUTED,
    });
    expect(calls).toEqual([]);
  });

  it("refuses a plan whose previous tag was force-moved to another commit", async () => {
    // The name is unchanged, so nothing about the version looks stale — but
    // the delta the author read was computed from where that tag used to
    // point. Publishing it would ship a comparison nobody reviewed (#521).
    const calls: string[] = [];
    const publish = buildPublish({
      facts: { tags: [{ name: "v1.2.3", commit: "moved" }] },
      onPublishTag: (name) => calls.push(name),
    });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
      recomputed: RECOMPUTED,
    });
    expect(calls).toEqual([]);
  });

  it("refuses a plan whose proposed version the remote already carries", async () => {
    // A tag the fetch already shows is not this release to make, whatever the
    // highest tag says. Refused here, so the push is never asked (#521).
    const calls: string[] = [];
    const publish = buildPublish({
      facts: {
        tags: [
          { name: "v1.2.3", commit: "old" },
          { name: "v1.2.4", commit: "taken" },
        ],
      },
      onPublishTag: (name) => calls.push(name),
    });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
      recomputed: RECOMPUTED,
    });
    expect(calls).toEqual([]);
  });

  it("fetches again before recomputing, so the refused plan is not handed back", async () => {
    // A push the remote refused means the local refs are already behind. A
    // recompute from them would propose the very plan that was just refused.
    let fetches = 0;
    const publish = buildPublish({
      publishTagOutcome: "stale-tip",
      onFetch: () => {
        fetches += 1;
      },
    });

    await publish.execute(CONFIRMED, AT);

    expect(fetches).toBe(2);
  });

  it("recomputes a pre-push refusal from the refs it already fetched", async () => {
    // The mismatch was found in this call's own fetch, so those refs already
    // carry the replacement plan — a second reach at the remote buys nothing.
    let fetches = 0;
    const publish = buildPublish({
      facts: { defaultBranchCommit: "moved" },
      onFetch: () => {
        fetches += 1;
      },
    });

    await publish.execute(CONFIRMED, AT);

    expect(fetches).toBe(1);
  });

  it("recomputes nothing when the fetch behind the refusal could not reach the remote", async () => {
    // A plan read from refs the remote has already refused is the refused plan
    // wearing a new label. `planRelease` reads local refs and only asks that
    // something was once fetched, so it cannot notice this itself (#521).
    const publish = buildPublish({
      publishTagOutcome: "stale-tip",
      fetchOutcomes: ["fetched", "offline"],
    });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
    });
  });

  it("recomputes against the harness it locked, not whichever is connected now", async () => {
    // Connecting a second harness mid-flight must not let a refusal for one
    // repository answer with a plan for another (#521).
    const roots: string[] = [];
    const publish = buildPublish({
      publishTagOutcome: "stale-tip",
      replan: async (root) => {
        roots.push(root);
        return { ok: true, plan: RECOMPUTED };
      },
    });

    await publish.execute(CONFIRMED, AT);

    expect(roots).toEqual(["/harness"]);
  });

  it("still refuses when the recompute itself has no answer", async () => {
    const publish = buildPublish({
      publishTagOutcome: "stale-tip",
      replan: async () => ({ ok: false, error: "no-answer" }),
    });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "plan-changed",
    });
  });

  it("recomputes nothing for a failure the plan did not cause", async () => {
    const publish = buildPublish({ publishTagOutcome: "push-failed" });

    await expect(publish.execute(CONFIRMED, AT)).resolves.toEqual({
      ok: false,
      error: "publish-failed",
    });
  });

  it("refuses a second confirmation for the same harness while one is already running", async () => {
    let releaseFetch = () => {};
    const held = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const publish = buildPublish({ fetchHold: held });

    const first = publish.execute(CONFIRMED, AT);
    const second = await publish.execute(CONFIRMED, AT);

    expect(second).toEqual({ ok: false, error: "publish-in-progress" });
    releaseFetch();
    await expect(first).resolves.toEqual({
      ok: true,
      tag: "v1.2.4",
      revision: "head",
    });
  });
});
