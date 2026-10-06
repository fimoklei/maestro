import type { HarnessStageRow, HarnessState } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { machineValues } from "../test-utils";
import { plainText } from "../ui/phrase";
import {
  harnessAnnouncement,
  releaseEnabled,
  stageSections,
} from "./harness-view-model";

const NOW = new Date("2026-08-03T12:00:00.000Z");

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
  const READ_AT = "2026-08-03T11:56:00.000Z";

  const state = (stages: Partial<HarnessState["stages"]>): HarnessState => ({
    origin: "github.com/fimoklei/agent-harness",
    releasedVersion: "v1.4.0",
    defaultBranch: "main",
    releaseState: "released",
    freshness: { outcome: "fetched", lastFetchedAt: READ_AT },
    cloneSync: "current",
    localHeadCommit: "local-head",
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
    change: "edit",
    requests: [],
    reviewers: [],
    comparison,
    alsoIn: [],
    concurrentChange: false,
    waitingOn: null,
    localOnly: false,
    remoteTree: null,
    restorable: false,
    folderOnDisk: false,
    previousName: null,
  });

  const sectionMeta = (built: HarnessState, stage: string) =>
    stageSections(built).find((section) => section.stage === stage)?.meta;
  const metaOf = (built: HarnessState, stage: string) => {
    const meta = sectionMeta(built, stage);
    return meta === null || meta === undefined ? meta : plainText(meta);
  };

  it("puts the three stages in journey order", () => {
    expect(stageSections(state({})).map((each) => each.title)).toEqual([
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
      "Compared with pull request #412",
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

    expect(metaOf(built, "pending-proposal")).toBe("Compared with main");
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
      "Compared with each skill's proposal or main",
    );
  });

  it("leaves a routine read without a meta line", () => {
    expect(metaOf(state({}), "pending-proposal")).toBeNull();
    expect(metaOf(state({}), "pending-review")).toBeNull();
  });

  it("names the bound a review read filled", () => {
    const built = state({
      review: { outcome: "read", bound: 100, rows: [] },
    });

    expect(metaOf(built, "pending-review")).toBe(
      "Read the 100 most recent pull requests",
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

  it("sets the branch and release a stage was compared with apart", () => {
    const proposal = state({
      proposal: {
        outcome: "read",
        bound: null,
        rows: [row({ kind: "default-branch" })],
      },
    });
    const mixed = state({
      proposal: {
        outcome: "read",
        bound: null,
        rows: [
          row({ kind: "proposal", number: 412 }),
          row({ kind: "default-branch" }),
        ],
      },
    });

    expect(
      machineValues(sectionMeta(proposal, "pending-proposal") ?? ""),
    ).toEqual(["main"]);
    expect(machineValues(sectionMeta(mixed, "pending-proposal") ?? "")).toEqual(
      ["main"],
    );
    expect(
      machineValues(sectionMeta(state({}), "pending-release") ?? ""),
    ).toEqual(["v1.4.0"]);
  });

  it("names the release Pending release was compared with", () => {
    expect(metaOf(state({}), "pending-release")).toBe("Compared with v1.4.0");
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
    cloneSync: "current",
    localHeadCommit: "local-head",
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
    change: "edit",
    requests: [],
    reviewers: [],
    comparison: { kind: "default-branch" },
    alsoIn: [],
    concurrentChange: false,
    waitingOn: null,
    localOnly: false,
    remoteTree: null,
    restorable: false,
    folderOnDisk: false,
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
