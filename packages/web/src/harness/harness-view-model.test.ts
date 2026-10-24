import type { HarnessFreshness } from "@maestro/core";
import { describe, expect, it } from "vitest";
import type { BandCount } from "../ui/band-summary";
import { releaseCause } from "./harness-view-model";

const FETCHED: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-01T07:00:00.000Z",
};

const counts = (review: number, release: number): BandCount[] => [
  { word: "Pending review", count: review, family: "attention" },
  { word: "Pending release", count: release, family: "attention", gate: true },
];

describe("releaseCause", () => {
  it("gives the stale notice's heading while GitHub gave no answer", () => {
    expect(
      releaseCause({
        freshness: { ...FETCHED, outcome: "offline" },
        staleNotice: {
          level: "warning",
          label: "Status out of date",
          message: "Select Re-read Harness to read GitHub again.",
        },
        nothingToRelease: false,
        counts: counts(0, 1),
      }),
    ).toBe("Status out of date");
  });

  it.each([
    ["offline", "Offline"],
    ["fetch-failed", "Read failed"],
  ] as const)("gives band 2's word without a notice, %s", (outcome, word) => {
    expect(
      releaseCause({
        freshness: { outcome, lastFetchedAt: null },
        staleNotice: null,
        nothingToRelease: false,
        counts: counts(0, 1),
      }),
    ).toBe(word);
  });

  it("says nothing is to release while work waits for review", () => {
    expect(
      releaseCause({
        freshness: FETCHED,
        staleNotice: null,
        nothingToRelease: true,
        counts: counts(1, 0),
      }),
    ).toBe("Nothing to release");
  });

  it("says All released when every count is 0", () => {
    expect(
      releaseCause({
        freshness: FETCHED,
        staleNotice: null,
        nothingToRelease: true,
        counts: counts(0, 0),
      }),
    ).toBe("All released");
  });

  it("gives no cause when a release can open", () => {
    expect(
      releaseCause({
        freshness: FETCHED,
        staleNotice: null,
        nothingToRelease: false,
        counts: counts(0, 2),
      }),
    ).toBeNull();
  });
});
