import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  finishRun,
  forgetGreenRun,
  recordGreenRun,
  reusableGreenRun,
  startRun,
} from "../../scripts/verify-reuse.mjs";

describe("the green-run record", () => {
  let logDir: string;
  const logs = ["lint.log", "test.log"];
  const finishedAt = "2026-09-23T10:00:00.000Z";

  beforeEach(async () => {
    logDir = await mkdtemp(join(tmpdir(), "maestro-verify-logs-"));
    for (const log of logs) await writeFile(join(logDir, log), `${log} ok\n`);
  });

  afterEach(async () => {
    await rm(logDir, { recursive: true, force: true });
  });

  it("offers the recorded run for the same fingerprint", () => {
    recordGreenRun(logDir, { fingerprint: "abc", finishedAt, logs });
    expect(reusableGreenRun(logDir, "abc")).toEqual({ finishedAt });
  });

  it("offers nothing for another fingerprint", () => {
    recordGreenRun(logDir, { fingerprint: "abc", finishedAt, logs });
    expect(reusableGreenRun(logDir, "def")).toBeNull();
  });

  it("offers nothing when no run was recorded", () => {
    expect(reusableGreenRun(logDir, "abc")).toBeNull();
  });

  it("offers nothing once the record is forgotten", () => {
    recordGreenRun(logDir, { fingerprint: "abc", finishedAt, logs });
    forgetGreenRun(logDir);
    expect(reusableGreenRun(logDir, "abc")).toBeNull();
  });

  it("offers nothing once a log of the recorded run was overwritten", async () => {
    recordGreenRun(logDir, { fingerprint: "abc", finishedAt, logs });
    await writeFile(join(logDir, "test.log"), "a later run\n");
    expect(reusableGreenRun(logDir, "abc")).toBeNull();
  });

  it("offers nothing once a log of the recorded run is gone", async () => {
    recordGreenRun(logDir, { fingerprint: "abc", finishedAt, logs });
    await rm(join(logDir, "lint.log"));
    expect(reusableGreenRun(logDir, "abc")).toBeNull();
  });

  it("offers nothing for an unreadable record", async () => {
    await writeFile(join(logDir, "verify-green.json"), "{not json");
    expect(reusableGreenRun(logDir, "abc")).toBeNull();
  });

  it("forgets without failing when nothing was recorded", () => {
    expect(() => forgetGreenRun(logDir)).not.toThrow();
  });

  it("starts in full and forgets the record when forced", () => {
    recordGreenRun(logDir, { fingerprint: "abc", finishedAt, logs });
    expect(startRun(logDir, "abc", { force: true })).toBeNull();
    expect(reusableGreenRun(logDir, "abc")).toBeNull();
  });

  it("starts by reusing the recorded run when not forced", () => {
    recordGreenRun(logDir, { fingerprint: "abc", finishedAt, logs });
    expect(startRun(logDir, "abc", { force: false })).toEqual({ finishedAt });
  });

  it("starts in full when the tree has no fingerprint", () => {
    expect(startRun(logDir, null, { force: false })).toBeNull();
  });

  it("records a green run on an unchanged tree", () => {
    const outcome = finishRun(logDir, {
      passed: true,
      before: "abc",
      after: "abc",
      finishedAt,
      logs,
    });
    expect(outcome).toBe("recorded");
    expect(reusableGreenRun(logDir, "abc")).toEqual({ finishedAt });
  });

  it("records nothing for a red run", () => {
    const outcome = finishRun(logDir, {
      passed: false,
      before: "abc",
      after: "abc",
      finishedAt,
      logs,
    });
    expect(outcome).toBe("red");
    expect(reusableGreenRun(logDir, "abc")).toBeNull();
  });

  it("records nothing when the tree changed during the run", () => {
    const outcome = finishRun(logDir, {
      passed: true,
      before: "abc",
      after: "def",
      finishedAt,
      logs,
    });
    expect(outcome).toBe("tree-changed");
    expect(reusableGreenRun(logDir, "abc")).toBeNull();
    expect(reusableGreenRun(logDir, "def")).toBeNull();
  });
});
