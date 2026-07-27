import { describe, expect, it } from "vitest";
import { InFlightLocks } from "./in-flight-locks";

// A deferred promise, so a test can hold one critical section open while it
// tries to enter another.
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("InFlightLocks", () => {
  it("runs the work and returns its value when the key is free", async () => {
    const locks = new InFlightLocks();
    const result = await locks.run("/repo", async () => "done");
    expect(result).toEqual({ ok: true, value: "done" });
  });

  it("refuses a second entry while the same key is held", async () => {
    const locks = new InFlightLocks();
    const held = deferred();
    const first = locks.run("/repo", () => held.promise);

    expect(await locks.run("/repo", async () => "second")).toEqual({
      ok: false,
    });

    held.resolve();
    await first;
  });

  it("lets a different key through while another is held", async () => {
    const locks = new InFlightLocks();
    const held = deferred();
    const first = locks.run("/repo-a", () => held.promise);

    expect(await locks.run("/repo-b", async () => "b")).toEqual({
      ok: true,
      value: "b",
    });

    held.resolve();
    await first;
  });

  it("releases the key after the work throws", async () => {
    const locks = new InFlightLocks();
    await expect(
      locks.run("/repo", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await locks.run("/repo", async () => "after")).toEqual({
      ok: true,
      value: "after",
    });
  });
});
