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
