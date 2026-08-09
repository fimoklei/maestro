import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { PromoteSkill } from "./promote-skill";
import type {
  HarnessFacts,
  HarnessFreshness,
  PromoteSkillOutcome,
} from "./read-harness-state";

const AT = new Date("2026-08-09T12:00:00.000Z");

const FACTS: HarnessFacts = {
  originUrl: "git@github.com:fimoklei/agent-harness.git",
  defaultBranch: "main",
  defaultBranchCommit: "head",
  tags: [],
};

const FRESHNESS: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-01T07:00:00.000Z",
};

function buildPromote(overrides?: {
  root?: string | undefined;
  facts?: Partial<HarnessFacts>;
  freshness?: HarnessFreshness;
  fetchOutcome?: "fetched" | "offline" | "fetch-failed";
  fetchHold?: Promise<void>;
  outcome?: PromoteSkillOutcome;
  onPush?: (root: string, name: string, base: string) => void;
  onFreshnessRecord?: (root: string, freshness: HarnessFreshness) => void;
}) {
  return new PromoteSkill({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    locks: new InFlightLocks(),
    git: {
      fetch: async () => {
        await overrides?.fetchHold;
        return overrides?.fetchOutcome ?? "fetched";
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
      readSkillManifests: async () => ({}),
      publishTag: async () => "pushed",
      pushSkillPromotion: async (root, name, base) => {
        overrides?.onPush?.(root, name, base);
        return overrides?.outcome ?? "pushed";
      },
    },
    freshness: {
      read: async () => overrides?.freshness ?? FRESHNESS,
      record: async (root, freshness) => {
        overrides?.onFreshnessRecord?.(root, freshness);
      },
    },
  });
}

describe("PromoteSkill", () => {
  it("pushes the skill and answers with the branch and its pull-request page", async () => {
    const pushed: string[] = [];
    const promote = buildPromote({
      onPush: (root, name, base) => pushed.push(root, name, base),
    });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: true,
      branch: "maestro/tdd",
      pullRequestUrl:
        "https://github.com/fimoklei/agent-harness/compare/main...maestro/tdd?expand=1",
    });
    // The commit is built on the tip this call just fetched, never on local
    // HEAD: unrelated local commits must not ride into the pull request.
    expect(pushed).toEqual(["/harness", "tdd", "head"]);
  });

  it("refuses when no harness is connected", async () => {
    const promote = buildPromote({ root: undefined });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses an origin apm could never resolve", async () => {
    const promote = buildPromote({ facts: { originUrl: "/srv/mirror.git" } });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });

  it("refuses a name that is not a plain skill directory, without reaching git", async () => {
    let reached = false;
    const promote = buildPromote({ onPush: () => (reached = true) });

    await expect(promote.execute("../secrets", AT)).resolves.toEqual({
      ok: false,
      error: "invalid-skill",
    });
    expect(reached).toBe(false);
  });

  it("reports a fetch that got no answer as the unfresh state release uses", async () => {
    let reached = false;
    const promote = buildPromote({
      fetchOutcome: "offline",
      onPush: () => (reached = true),
    });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
    expect(reached).toBe(false);
  });

  it("records what the fetch found, so the screen shows this call's own reach", async () => {
    const recorded: HarnessFreshness[] = [];
    const promote = buildPromote({
      onFreshnessRecord: (_root, freshness) => recorded.push(freshness),
    });

    await promote.execute("tdd", AT);

    expect(recorded).toEqual([
      { outcome: "fetched", lastFetchedAt: AT.toISOString() },
    ]);
  });

  it("keeps the last successful time when this fetch failed", async () => {
    const recorded: HarnessFreshness[] = [];
    const promote = buildPromote({
      fetchOutcome: "fetch-failed",
      onFreshnessRecord: (_root, freshness) => recorded.push(freshness),
    });

    await promote.execute("tdd", AT);

    expect(recorded).toEqual([
      { outcome: "fetch-failed", lastFetchedAt: FRESHNESS.lastFetchedAt },
    ]);
  });

  it("refuses when the remote's default branch could not be read", async () => {
    const promote = buildPromote({
      facts: { defaultBranch: null, defaultBranchCommit: null },
    });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("reports a skill that is not in the working harness", async () => {
    const promote = buildPromote({ outcome: "skill-missing" });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "skill-missing",
    });
  });

  it("reports a push that never reached the remote as no answer", async () => {
    const promote = buildPromote({ outcome: "offline" });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("leaves a refused push as a failure the author can press again", async () => {
    const promote = buildPromote({ outcome: "push-failed" });

    await expect(promote.execute("tdd", AT)).resolves.toEqual({
      ok: false,
      error: "promote-failed",
    });
  });

  it("refuses a second promotion of the same harness while one is in flight", async () => {
    let release = () => {};
    const promote = buildPromote({
      fetchHold: new Promise<void>((resolve) => {
        release = resolve;
      }),
    });

    const first = promote.execute("tdd", AT);
    const second = await promote.execute("jobs", AT);
    release();

    expect(second).toEqual({ ok: false, error: "promote-in-progress" });
    await expect(first).resolves.toMatchObject({ ok: true });
  });
});
