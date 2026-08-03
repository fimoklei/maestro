import { describe, expect, it } from "vitest";
import { cockpitPortsFor } from "../../scripts/cockpit-ports.mjs";

const worktree = "/Users/dev/Projects/maestro";
const sibling = "/Users/dev/Projects/maestro/.claude/worktrees/issue397";

describe("cockpitPortsFor", () => {
  it("gives the same worktree the same pair every time", () => {
    expect(cockpitPortsFor(worktree, {})).toEqual(
      cockpitPortsFor(worktree, {}),
    );
  });

  it("gives two worktrees pairs that do not overlap", () => {
    const here = cockpitPortsFor(worktree, {});
    const there = cockpitPortsFor(sibling, {});

    expect([here.server, here.web]).not.toContain(there.server);
    expect([here.server, here.web]).not.toContain(there.web);
  });

  // Two paths whose hashes land on the same slot, found by sweeping the range.
  const twinA = `${worktree}/.claude/worktrees/issue26`;
  const twinB = `${worktree}/.claude/worktrees/issue370`;

  it("moves one of two worktrees that hash to the same slot", () => {
    const known = [twinA, twinB];

    expect(cockpitPortsFor(twinA, {}, known)).not.toEqual(
      cockpitPortsFor(twinB, {}, known),
    );
  });

  it("resolves a collision the same way from either worktree", () => {
    // Both sides read the same worktree list, so neither has to be told what
    // the other took — order of the list must not change the answer.
    expect(cockpitPortsFor(twinA, {}, [twinA, twinB])).toEqual(
      cockpitPortsFor(twinA, {}, [twinB, twinA]),
    );
  });

  it("leaves an uncontested worktree on its own slot", () => {
    // A worktree added elsewhere must not shuffle a running one's ports.
    expect(cockpitPortsFor(worktree, {}, [worktree, twinA, twinB])).toEqual(
      cockpitPortsFor(worktree, {}),
    );
  });

  it("falls back to the plain slot when the worktree list is unavailable", () => {
    expect(cockpitPortsFor(twinA, {}, null)).toEqual(
      cockpitPortsFor(twinA, {}),
    );
  });

  it("keeps both ports in the private range, below the ephemeral one", () => {
    for (const path of [worktree, sibling, "/tmp/x", "/"]) {
      const { server, web } = cockpitPortsFor(path, {});
      expect(server).toBeGreaterThanOrEqual(20000);
      expect(web).toBeLessThan(49152);
      expect(web).not.toBe(server);
    }
  });

  it("lets the environment pin either port", () => {
    expect(cockpitPortsFor(worktree, { PORT: "3000" }).server).toBe(3000);
    expect(cockpitPortsFor(worktree, { WEB_PORT: "5173" }).web).toBe(5173);
  });

  it("ignores an unusable port in the environment rather than binding NaN", () => {
    const derived = cockpitPortsFor(worktree, {});

    expect(cockpitPortsFor(worktree, { PORT: "not-a-port" })).toEqual(derived);
    expect(cockpitPortsFor(worktree, { WEB_PORT: "0" })).toEqual(derived);
  });
});
