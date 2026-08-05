import { describe, expect, it } from "vitest";
import { PublishRelease } from "./publish-release";
import type { HarnessFacts, HarnessFreshness } from "./read-harness-state";

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

function buildPublish(overrides?: {
  root?: string | undefined;
  facts?: Partial<HarnessFacts>;
  freshness?: HarnessFreshness;
  fetchOutcome?: "fetched" | "offline" | "fetch-failed";
  publishTagOutcome?: "pushed" | "already-exists" | "offline" | "push-failed";
  onPublishTag?: (name: string, commit: string) => void;
  onFreshnessRecord?: (root: string, freshness: HarnessFreshness) => void;
}) {
  return new PublishRelease({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : "/harness",
    git: {
      fetch: async () => overrides?.fetchOutcome ?? "fetched",
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
      publishTag: async (_root: string, name: string, commit: string) => {
        overrides?.onPublishTag?.(name, commit);
        return overrides?.publishTagOutcome ?? "pushed";
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

describe("PublishRelease", () => {
  it("refuses when no harness is connected", async () => {
    const publish = buildPublish({ root: undefined });

    await expect(publish.execute("patch", AT)).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses an origin apm could never resolve", async () => {
    const publish = buildPublish({ facts: { originUrl: "/srv/mirror.git" } });

    await expect(publish.execute("patch", AT)).resolves.toEqual({
      ok: false,
      error: "no-usable-origin",
    });
  });

  it("has no answer when the confirmation's own fetch cannot reach the remote", async () => {
    const publish = buildPublish({ fetchOutcome: "offline" });

    await expect(publish.execute("patch", AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when the default branch tip could not be read", async () => {
    const publish = buildPublish({
      facts: { defaultBranchCommit: null },
    });

    await expect(publish.execute("patch", AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("has no answer when the release tags could not be read", async () => {
    const publish = buildPublish({ facts: { tags: null } });

    await expect(publish.execute("patch", AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("tags the freshly read revision with the chosen step's version", async () => {
    const calls: { name: string; commit: string }[] = [];
    const publish = buildPublish({
      onPublishTag: (name, commit) => calls.push({ name, commit }),
    });

    const result = await publish.execute("minor", AT);

    expect(result).toEqual({ ok: true, tag: "v1.3.0", revision: "head" });
    expect(calls).toEqual([{ name: "v1.3.0", commit: "head" }]);
  });

  it("proposes v0.1.0-style versions for a never-released harness", async () => {
    const publish = buildPublish({ facts: { tags: [] } });

    await expect(publish.execute("minor", AT)).resolves.toEqual({
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

    await publish.execute("patch", AT);

    expect(records).toEqual([
      {
        root: "/harness",
        freshness: { outcome: "fetched", lastFetchedAt: AT.toISOString() },
      },
    ]);
  });

  it("reports someone else's race to the same version as already released", async () => {
    const publish = buildPublish({ publishTagOutcome: "already-exists" });

    await expect(publish.execute("patch", AT)).resolves.toEqual({
      ok: false,
      error: "already-released",
    });
  });

  it("has no answer when the push itself cannot reach the remote", async () => {
    const publish = buildPublish({ publishTagOutcome: "offline" });

    await expect(publish.execute("patch", AT)).resolves.toEqual({
      ok: false,
      error: "no-answer",
    });
  });

  it("reports any other push refusal as a failed publish", async () => {
    const publish = buildPublish({ publishTagOutcome: "push-failed" });

    await expect(publish.execute("patch", AT)).resolves.toEqual({
      ok: false,
      error: "publish-failed",
    });
  });
});
