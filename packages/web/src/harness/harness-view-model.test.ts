import { describe, expect, it } from "vitest";
import {
  freshnessLabel,
  RELEASE_SUMMARIES,
  releaseEnabled,
} from "./harness-view-model";

const NOW = new Date("2026-08-03T12:00:00.000Z");

describe("freshnessLabel", () => {
  it("says so plainly when nothing has been fetched yet", () => {
    expect(freshnessLabel({ outcome: null, lastFetchedAt: null }, NOW)).toBe(
      "Not fetched yet",
    );
  });

  it("dates a successful fetch in words, so the age reads at a glance", () => {
    expect(
      freshnessLabel(
        { outcome: "fetched", lastFetchedAt: "2026-08-03T11:56:00.000Z" },
        NOW,
      ),
    ).toBe("Fetched 4 min ago");
  });

  it("reads a timestamp it cannot make sense of as no time at all", () => {
    // The config is hand-editable; a date formatter fed a bad string throws
    // and takes the whole view down (#516).
    expect(
      freshnessLabel(
        { outcome: "fetched", lastFetchedAt: "yesterday-ish" },
        NOW,
      ),
    ).toBe("Not fetched yet");
  });

  it("reads a fetch with no time recorded as no fetch at all", () => {
    expect(
      freshnessLabel({ outcome: "fetched", lastFetchedAt: null }, NOW),
    ).toBe("Not fetched yet");
  });

  it("reads a fetch seconds old as just now", () => {
    expect(
      freshnessLabel(
        { outcome: "fetched", lastFetchedAt: "2026-08-03T11:59:40.000Z" },
        NOW,
      ),
    ).toBe("Fetched just now");
  });

  it("falls back to a date once the picture is days old", () => {
    expect(
      freshnessLabel(
        { outcome: "fetched", lastFetchedAt: "2026-07-20T12:00:00.000Z" },
        NOW,
      ),
    ).toBe("Fetched on 20 Jul");
  });

  it("holds offline apart from a fetch that failed", () => {
    const offline = freshnessLabel(
      { outcome: "offline", lastFetchedAt: "2026-08-03T11:00:00.000Z" },
      NOW,
    );
    const failed = freshnessLabel(
      { outcome: "fetch-failed", lastFetchedAt: "2026-08-03T11:00:00.000Z" },
      NOW,
    );

    expect(offline).toBe("Offline — last fetched 1 h ago");
    expect(failed).toBe("Fetch failed — last fetched 1 h ago");
    expect(offline).not.toBe(failed);
  });

  it("says never fetched when no fetch has ever succeeded", () => {
    expect(
      freshnessLabel({ outcome: "offline", lastFetchedAt: null }, NOW),
    ).toBe("Offline — never fetched");
  });

  it("never turns a failed fetch into a permission verdict of ours", () => {
    // Whether GitHub lets this author in is GitHub's answer to give (#516).
    const label = freshnessLabel(
      { outcome: "fetch-failed", lastFetchedAt: null },
      NOW,
    );

    expect(label).toBe("Fetch failed — never fetched");
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

describe("RELEASE_SUMMARIES", () => {
  it("reads a quiet harness as nothing waiting", () => {
    expect(RELEASE_SUMMARIES["released"]).toBe(
      "Everything merged is released.",
    );
  });

  it("names merged work the released harness does not carry yet", () => {
    expect(RELEASE_SUMMARIES["pending-release"]).toBe(
      "Merged changes are waiting for release.",
    );
  });

  it("reads a harness before its first tag as a normal day", () => {
    expect(RELEASE_SUMMARIES["never-released"]).toBe("No release yet.");
  });

  it("admits it cannot tell before the first fetch", () => {
    expect(RELEASE_SUMMARIES["unknown"]).toBe(
      "Not fetched yet, so what is waiting is unknown.",
    );
  });
});
