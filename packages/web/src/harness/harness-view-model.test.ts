import type { HarnessFreshness } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { releaseCause } from "./harness-view-model";

const FETCHED: HarnessFreshness = {
  outcome: "fetched",
  lastFetchedAt: "2026-08-01T07:00:00.000Z",
};

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
      }),
    ).toBe(word);
  });

  it("says Nothing to release when nothing waits in Pending release", () => {
    expect(
      releaseCause({
        freshness: FETCHED,
        staleNotice: null,
        nothingToRelease: true,
      }),
    ).toBe("Nothing to release");
  });

  it("gives no cause when a release can open", () => {
    expect(
      releaseCause({
        freshness: FETCHED,
        staleNotice: null,
        nothingToRelease: false,
      }),
    ).toBeNull();
  });
});
