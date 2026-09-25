import { describe, expect, it } from "vitest";
import type { DeployedRollup } from "./deployed-rollup";
import { skillStatus, targetReading } from "./skill-status";

const rollup = (over: Partial<DeployedRollup>): DeployedRollup => ({
  targetCount: 0,
  behindCount: 0,
  unknownCount: 0,
  ...over,
});

const word = (value: DeployedRollup) => skillStatus(value)?.word ?? null;

describe("skillStatus", () => {
  it("reads Up to date when every target's check ran clean", () => {
    expect(skillStatus(rollup({ targetCount: 3 }))).toEqual({
      word: "Up to date",
      family: "good",
      glyph: "✓",
    });
  });

  it("reads Not deployed, not a blank, when the skill reaches no target", () => {
    expect(skillStatus(rollup({}))).toEqual({
      word: "Not deployed",
      family: "neutral",
      glyph: "–",
    });
  });

  it("reads Behind when one target is behind", () => {
    expect(skillStatus(rollup({ targetCount: 4, behindCount: 1 }))).toEqual({
      word: "Behind",
      family: "attention",
      glyph: "↑",
    });
  });

  it("reads Unknown with a ? when a target's check could not run", () => {
    expect(skillStatus(rollup({ targetCount: 2, unknownCount: 1 }))).toEqual({
      word: "Unknown",
      family: "unknown",
      glyph: "?",
    });
  });

  it("shows one badge, the worst, when behind and unknown meet", () => {
    expect(
      word(rollup({ targetCount: 3, behindCount: 1, unknownCount: 1 })),
    ).toBe("Behind");
  });

  it("shows nothing while a deploy-state read is still in flight", () => {
    // Zero reach before every read lands is not "deployed nowhere", and no status
    // shows before the server confirms it.
    expect(skillStatus(rollup({ pending: true }))).toBeNull();
    expect(skillStatus(rollup({ targetCount: 1, pending: true }))).toBeNull();
  });

  it("shows nothing while an update check is still running", () => {
    expect(skillStatus(rollup({ targetCount: 1, checking: true }))).toBeNull();
  });

  it("reads Unknown, never Not deployed, when a deploy-state read failed", () => {
    expect(word(rollup({ unreadable: true }))).toBe("Unknown");
    expect(word(rollup({ targetCount: 2, unreadable: true }))).toBe("Unknown");
  });
});

// One target's own badge in the hover card and the detail pane (#1041).
describe("targetReading", () => {
  const wordFor = (status: Parameters<typeof targetReading>[0]) =>
    targetReading(status)?.word ?? null;

  it("reads Up to date for a clean copy, and for an older tag that left the skill unchanged", () => {
    expect(wordFor("up-to-date")).toBe("Up to date");
    // The pin lags, but nothing in the skill changed.
    expect(wordFor("older-tag")).toBe("Up to date");
  });

  it("reads Behind where the newest release changed this skill", () => {
    expect(targetReading("behind")).toEqual({
      word: "Behind",
      family: "attention",
      glyph: "↑",
    });
  });

  it("reads No longer released as a warning, not a lag", () => {
    expect(targetReading("no-longer-released")).toEqual({
      word: "No longer released",
      family: "attention",
      glyph: "⚠",
    });
  });

  it("never reads a check that could not answer as fine", () => {
    expect(targetReading("unknown")?.family).toBe("unknown");
    expect(targetReading("unverified")).toEqual({
      word: "Unverified",
      family: "unknown",
      glyph: "?",
    });
  });

  it("shows no reading while the check is still running", () => {
    expect(targetReading("pending")).toBeNull();
  });
});
