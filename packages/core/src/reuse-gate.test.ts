import { describe, expect, it } from "vitest";
import { ReuseGate } from "./reuse-gate";

const MAX_AGE = 30_000;

const gateKeeping = (keep: (value: string) => boolean) =>
  new ReuseGate<string>({ now: () => new Date(0), keep });

describe("ReuseGate", () => {
  it("reuses a kept value within its maximum age", async () => {
    const gate = gateKeeping(() => true);
    await gate.run("k", MAX_AGE, async () => "first");

    await expect(gate.run("k", MAX_AGE, async () => "second")).resolves.toBe(
      "first",
    );
  });

  it("never reuses a value the keep rule refuses", async () => {
    const gate = gateKeeping((value) => value !== "failed");
    await gate.run("k", MAX_AGE, async () => "failed");

    await expect(gate.run("k", MAX_AGE, async () => "read")).resolves.toBe(
      "read",
    );
  });

  it("hands a refused value to the callers that joined its run", async () => {
    const gate = gateKeeping((value) => value !== "failed");
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const work = async () => {
      await held;
      return "failed";
    };

    const both = Promise.all([
      gate.run("k", MAX_AGE, work),
      gate.run("k", MAX_AGE, async () => "read"),
    ]);
    release();

    await expect(both).resolves.toEqual(["failed", "failed"]);
  });
});
