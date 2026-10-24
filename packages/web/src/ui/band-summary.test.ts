import { describe, expect, it } from "vitest";
import { type BandCount, bandSummary } from "./band-summary";
import type { Freshness } from "./freshness";

const NOW = new Date("2026-08-03T12:00:00.000Z");
const hoursAgo = (hours: number) => NOW.getTime() - hours * 3_600_000;
const READ: Freshness = { readAt: [hoursAgo(2)], outcome: "fetched" };
const UNKNOWN: BandCount = { word: "Unknown", count: 1, family: "failed" };
const BEHIND: BandCount = { word: "Behind", count: 4, family: "attention" };
const zero = (count: BandCount): BandCount => ({ ...count, count: 0 });

const summary = (freshness: Freshness, counts: readonly BandCount[] = []) =>
  bandSummary({ freshness, healthy: "In sync", counts }, NOW);

const pressed = (count: BandCount): BandCount => ({
  ...count,
  filter: { pressed: true, onToggle: () => {} },
});

describe("bandSummary", () => {
  it("keeps a pressed chip at 0 so it can be unpressed", () => {
    expect(summary(READ, [pressed(zero(UNKNOWN)), zero(BEHIND)])).toMatchObject(
      {
        family: "good",
        word: "In sync",
        counts: [{ word: "Unknown", count: 0 }],
      },
    );
  });

  it("keeps a pressed chip after a failed read", () => {
    expect(
      summary({ ...READ, outcome: "fetch-failed" }, [pressed(BEHIND)]).counts,
    ).toMatchObject([{ word: "Behind" }]);
  });

  it("reads red and Read failed when the screen's read failed, whatever the counts", () => {
    expect(summary({ ...READ, outcome: "fetch-failed" }, [BEHIND])).toEqual({
      family: "failed",
      word: "Read failed",
      counts: [],
      age: "last read 2 h ago",
    });
  });

  it("reads red and Offline when the server cannot be reached", () => {
    expect(summary({ ...READ, outcome: "offline" })).toMatchObject({
      family: "failed",
      word: "Offline",
      age: "last read 2 h ago",
    });
  });

  it("gives no age after a failure that never had a read", () => {
    expect(summary({ readAt: [null], outcome: "fetch-failed" }).age).toBeNull();
  });

  it("reads grey and Not read yet before the first reading", () => {
    for (const freshness of [
      { readAt: [null], outcome: null },
      { readAt: [0], outcome: "untracked" },
      { readAt: [], outcome: "fetched" },
    ] satisfies Freshness[]) {
      expect(summary(freshness, [UNKNOWN])).toEqual({
        family: "unknown",
        word: "Not read yet",
        counts: [],
        age: null,
      });
    }
  });

  it("reads red with the counts when a failed count is above 0", () => {
    expect(summary(READ, [UNKNOWN, BEHIND])).toEqual({
      family: "failed",
      word: null,
      counts: [UNKNOWN, BEHIND],
      age: "2 h ago",
    });
  });

  it("reads amber with the counts when only an attention count is above 0, zeros left out", () => {
    expect(summary(READ, [zero(UNKNOWN), BEHIND])).toEqual({
      family: "attention",
      word: null,
      counts: [BEHIND],
      age: "2 h ago",
    });
  });

  it("reads green and the healthy word when every count is 0", () => {
    expect(summary(READ, [zero(UNKNOWN), zero(BEHIND)])).toEqual({
      family: "good",
      word: "In sync",
      counts: [],
      age: "2 h ago",
    });
  });

  it("keeps a gate count at 0 while another count is above 0", () => {
    const gate: BandCount = { ...zero(BEHIND), gate: true };
    expect(summary(READ, [UNKNOWN, gate])).toMatchObject({
      family: "failed",
      word: null,
      counts: [UNKNOWN, gate],
    });
  });

  it("drops a gate count for the healthy word when every count is 0", () => {
    const gate: BandCount = { ...zero(BEHIND), gate: true };
    expect(summary(READ, [zero(UNKNOWN), gate])).toMatchObject({
      family: "good",
      word: "In sync",
      counts: [],
    });
  });
});

describe("bandSummary for a table with no Status column", () => {
  const noStatus = (freshness: Freshness) =>
    bandSummary({ freshness, counts: null }, NOW);

  it("shows no summary while the read is current, only the read age", () => {
    expect(noStatus(READ)).toEqual({
      family: null,
      word: null,
      counts: [],
      age: "2 h ago",
    });
  });

  it("reads grey and Not read yet before the first reading", () => {
    expect(noStatus({ readAt: [null], outcome: null })).toMatchObject({
      family: "unknown",
      word: "Not read yet",
    });
  });

  it("reads red and Read failed or Offline when the read failed", () => {
    expect(noStatus({ ...READ, outcome: "fetch-failed" })).toMatchObject({
      family: "failed",
      word: "Read failed",
      age: "last read 2 h ago",
    });
    expect(noStatus({ ...READ, outcome: "offline" })).toMatchObject({
      family: "failed",
      word: "Offline",
    });
  });
});
