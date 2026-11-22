import { describe, expect, it } from "vitest";
import { idleWatch } from "../../scripts/lib/idle-watch.mjs";

const LIMIT = 180_000;

describe("idleWatch", () => {
  it("stays quiet while output keeps coming", () => {
    const watch = idleWatch({ limitMs: LIMIT, startedAt: 0 });
    watch.output(100_000);
    expect(watch.check(200_000)).toBeNull();
  });

  it("reports a stall once the limit passes without output", () => {
    const watch = idleWatch({ limitMs: LIMIT, startedAt: 0 });
    expect(watch.check(180_000)).toBe(180_000);
  });

  it("reports one stall once, and again after output resumes and stops", () => {
    const watch = idleWatch({ limitMs: LIMIT, startedAt: 0 });
    expect(watch.check(200_000)).toBe(200_000);
    expect(watch.check(260_000)).toBeNull();
    watch.output(300_000);
    expect(watch.check(400_000)).toBeNull();
    expect(watch.check(480_000)).toBe(180_000);
  });
});
