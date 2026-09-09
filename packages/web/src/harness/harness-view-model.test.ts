import { describe, expect, it } from "vitest";
import {
  freshnessLabel,
  harnessAnnouncement,
  journeyConfirmedEmpty,
  releaseEnabled,
  stageSections,
} from "./harness-view-model";
import type { HarnessStageRow, HarnessState } from "./use-harness";

const NOW = new Date("2026-08-03T12:00:00.000Z");

describe("freshnessLabel", () => {
  it("says so plainly when nothing has been read yet", () => {
    expect(freshnessLabel({ outcome: null, lastFetchedAt: null }, NOW)).toBe(
      "Not read yet",
    );
  });

  it("dates a successful read in words, so the age reads at a glance", () => {
    expect(
      freshnessLabel(
        { outcome: "fetched", lastFetchedAt: "2026-08-03T11:56:00.000Z" },
        NOW,
      ),
    ).toBe("Read 4 min ago");
  });

  it("reads a timestamp it cannot make sense of as no time at all", () => {
    // The config is hand-editable; a date formatter fed a bad string throws
    // and takes the whole view down (#516).
    expect(
      freshnessLabel(
        { outcome: "fetched", lastFetchedAt: "yesterday-ish" },
        NOW,
      ),
    ).toBe("Not read yet");
  });

  it("treats a read with no time recorded as no read at all", () => {
    expect(
      freshnessLabel({ outcome: "fetched", lastFetchedAt: null }, NOW),
    ).toBe("Not read yet");
  });

  it("dates a read seconds old as just now", () => {
    expect(
      freshnessLabel(
        { outcome: "fetched", lastFetchedAt: "2026-08-03T11:59:40.000Z" },
        NOW,
      ),
    ).toBe("Read just now");
  });

  it("falls back to a date once the picture is days old", () => {
    expect(
      freshnessLabel(
        { outcome: "fetched", lastFetchedAt: "2026-07-20T12:00:00.000Z" },
        NOW,
      ),
    ).toBe("Read on 20 Jul");
  });

  it("holds offline apart from a read that failed", () => {
    const offline = freshnessLabel(
      { outcome: "offline", lastFetchedAt: "2026-08-03T11:00:00.000Z" },
      NOW,
    );
    const failed = freshnessLabel(
      { outcome: "fetch-failed", lastFetchedAt: "2026-08-03T11:00:00.000Z" },
      NOW,
    );

    expect(offline).toBe("Offline — last read 1 h ago");
    expect(failed).toBe("Read failed — last read 1 h ago");
    expect(offline).not.toBe(failed);
  });

  it("says never read when no read has ever succeeded", () => {
    expect(
      freshnessLabel({ outcome: "offline", lastFetchedAt: null }, NOW),
    ).toBe("Offline — never read");
  });

  it("never turns a failed read into a permission verdict of ours", () => {
    // Whether GitHub lets this author in is GitHub's answer to give (#516).
    const label = freshnessLabel(
      { outcome: "fetch-failed", lastFetchedAt: null },
      NOW,
    );

    expect(label).toBe("Read failed — never read");
    expect(label).not.toMatch(/permission|denied|not allowed|access/i);
  });
});

describe("releaseEnabled", () => {
  it("enables Release once a fetch has answered", () => {
    expect(
      releaseEnabled({
        outcome: "fetched",
        lastFetchedAt: "2026-08-03T11:56:00.000Z",
      }),
    ).toBe(true);
  });

  it("disables Release when the last fetch found no network", () => {
    expect(releaseEnabled({ outcome: "offline", lastFetchedAt: null })).toBe(
      false,
    );
  });

  it("disables Release when the last fetch failed", () => {
    expect(
      releaseEnabled({ outcome: "fetch-failed", lastFetchedAt: null }),
    ).toBe(false);
  });

  it("leaves Release open before any fetch has been attempted", () => {
    // Offline and fetch-failed are the two states that disable it (#519).
    // Anything else opens the dialog, which states the server's own answer.
    expect(releaseEnabled({ outcome: null, lastFetchedAt: null })).toBe(true);
  });
});

describe("stageSections", () => {
  const NOW = new Date("2026-08-03T12:00:00.000Z");
  const READ_AT = "2026-08-03T11:56:00.000Z";

  const state = (stages: Partial<HarnessState["stages"]>): HarnessState => ({
    origin: "github.com/fimoklei/agent-harness",
    releasedVersion: "v1.4.0",
    defaultBranch: "main",
    releaseState: "released",
    freshness: { outcome: "fetched", lastFetchedAt: READ_AT },
    stages: {
      proposal: { outcome: "read", rows: [], bound: null },
      review: { outcome: "read", rows: [], bound: null },
      release: { outcome: "read", rows: [], bound: null },
      ...stages,
    },
  });

  const row = (comparison: HarnessStageRow["comparison"]): HarnessStageRow => ({
    stage: "pending-proposal",
    skill: "tdd",
    status: "not-yet-proposed",
    deletion: false,
    requests: [],
    reviewers: [],
    comparison,
    alsoIn: [],
    concurrentChange: false,
    remoteTree: null,
    previousName: null,
  });

  const metaOf = (built: HarnessState, stage: string) =>
    stageSections(built, NOW).find((section) => section.stage === stage)?.meta;

  it("puts the three stages in journey order", () => {
    expect(stageSections(state({}), NOW).map((each) => each.title)).toEqual([
      "Pending proposal",
      "Pending review",
      "Pending release",
    ]);
  });

  it("names the sole proposal every row was compared with", () => {
    const built = state({
      proposal: {
        outcome: "read",
        bound: null,
        rows: [row({ kind: "proposal", number: 412 })],
      },
    });

    expect(metaOf(built, "pending-proposal")).toBe(
      "Compared with pull request #412, read 4 min ago",
    );
  });

  it("names the default branch when every row was compared with it", () => {
    const built = state({
      proposal: {
        outcome: "read",
        bound: null,
        rows: [row({ kind: "default-branch" })],
      },
    });

    expect(metaOf(built, "pending-proposal")).toBe(
      "Compared with main, read 4 min ago",
    );
  });

  it("asserts no single comparison when the rows disagree", () => {
    const built = state({
      proposal: {
        outcome: "read",
        bound: null,
        rows: [
          row({ kind: "proposal", number: 412 }),
          row({ kind: "default-branch" }),
        ],
      },
    });

    expect(metaOf(built, "pending-proposal")).toBe(
      "Compared with each skill's proposal or main, read 4 min ago",
    );
  });

  it("dates a stage with no rows without naming a comparison", () => {
    expect(metaOf(state({}), "pending-proposal")).toBe("Read 4 min ago");
  });

  it("names where the review facts came from, and when", () => {
    expect(metaOf(state({}), "pending-review")).toBe(
      "Read from GitHub 4 min ago",
    );
  });

  it("names the bound a review read filled", () => {
    const built = state({
      review: { outcome: "read", bound: 100, rows: [] },
    });

    expect(metaOf(built, "pending-review")).toBe(
      "Read the 100 most recent pull requests, 4 min ago",
    );
  });

  it("names the bound a review read filled seconds ago", () => {
    const built = {
      ...state({ review: { outcome: "read", bound: 50, rows: [] } }),
      freshness: {
        outcome: "fetched" as const,
        lastFetchedAt: "2026-08-03T11:59:40.000Z",
      },
    };

    expect(metaOf(built, "pending-review")).toBe(
      "Read the 50 most recent pull requests, just now",
    );
  });

  it("names the bound without a date when no read has ever landed", () => {
    const built = {
      ...state({ review: { outcome: "read", bound: 50, rows: [] } }),
      freshness: { outcome: null, lastFetchedAt: null },
    };

    expect(metaOf(built, "pending-review")).toBe(
      "Read the 50 most recent pull requests",
    );
  });

  it("replaces the whole slot when a review read failed or was unavailable", () => {
    expect(
      metaOf(state({ review: { outcome: "unknown" } }), "pending-review"),
    ).toBe("Review status unknown");
    expect(
      metaOf(state({ review: { outcome: "unavailable" } }), "pending-review"),
    ).toBe("Review status unavailable");
  });

  it("names the release Pending release was compared with", () => {
    expect(metaOf(state({}), "pending-release")).toBe(
      "Compared with v1.4.0, read 4 min ago",
    );
  });

  it("replaces the whole slot when a local stage could not be read", () => {
    expect(
      metaOf(state({ proposal: { outcome: "unknown" } }), "pending-proposal"),
    ).toBe("Status unknown");
  });
});

describe("harnessAnnouncement", () => {
  const READ_AT = "2026-08-03T11:56:00.000Z";

  const state = (stages: Partial<HarnessState["stages"]>): HarnessState => ({
    origin: "github.com/fimoklei/agent-harness",
    releasedVersion: "v1.4.0",
    defaultBranch: "main",
    releaseState: "released",
    freshness: { outcome: "fetched", lastFetchedAt: READ_AT },
    stages: {
      proposal: { outcome: "read", rows: [], bound: null },
      review: { outcome: "read", rows: [], bound: null },
      release: { outcome: "read", rows: [], bound: null },
      ...stages,
    },
  });

  const row = (skill: string): HarnessStageRow => ({
    stage: "pending-proposal",
    skill,
    status: "not-yet-proposed",
    deletion: false,
    requests: [],
    reviewers: [],
    comparison: { kind: "default-branch" },
    alsoIn: [],
    concurrentChange: false,
    remoteTree: null,
    previousName: null,
  });

  it("counts every stage and dates the picture they were read from", () => {
    const built = state({
      proposal: { outcome: "read", bound: null, rows: [row("tdd")] },
    });

    expect(harnessAnnouncement(built, NOW)).toBe(
      "Pending proposal has 1 change. Pending review has no changes. Pending release has no changes. Read 4 min ago.",
    );
  });

  it("counts more than one change in the plural", () => {
    const built = state({
      proposal: {
        outcome: "read",
        bound: null,
        rows: [row("tdd"), row("caveman")],
      },
    });

    expect(harnessAnnouncement(built, NOW)).toContain(
      "Pending proposal has 2 changes.",
    );
  });

  it("never counts a stage nobody could read as empty", () => {
    const built = state({ review: { outcome: "unavailable" } });

    expect(harnessAnnouncement(built, NOW)).toContain(
      "Pending review was not read.",
    );
  });

  it("says plainly when no read has ever succeeded", () => {
    const built = state({});
    built.freshness = { outcome: null, lastFetchedAt: null };

    expect(harnessAnnouncement(built, NOW)).toContain("Not read yet.");
  });
});

describe("journeyConfirmedEmpty", () => {
  const empty: HarnessState["stages"]["proposal"] = {
    outcome: "read",
    rows: [],
    bound: null,
  };
  const with_ = (stages: HarnessState["stages"]): HarnessState => ({
    origin: "github.com/fimoklei/agent-harness",
    releasedVersion: null,
    defaultBranch: "main",
    releaseState: "never-released",
    freshness: { outcome: "fetched", lastFetchedAt: null },
    stages,
  });

  it("reads three confirmed empty stages as an empty journey", () => {
    expect(
      journeyConfirmedEmpty(
        with_({ proposal: empty, review: empty, release: empty }),
      ),
    ).toBe(true);
  });

  it("never reads an unknown stage as empty", () => {
    expect(
      journeyConfirmedEmpty(
        with_({
          proposal: empty,
          review: { outcome: "unavailable" },
          release: empty,
        }),
      ),
    ).toBe(false);
  });
});
