import { createServer, type Server } from "node:net";
import { describe, expect, it } from "vitest";
import {
  decidePortOwnership,
  findPortOwners,
} from "../../scripts/guard-port-owner.mjs";

// Every worktree serves the cockpit on the same localhost:5173, so a dev server
// left running in a sibling keeps answering after you switch branches — the
// screenshot then proves the wrong tree (verify-in-smoke, "wrong worktree").
// This guard decides ownership before a browser command is allowed to run.
// Ownership is compared by git worktree root, never by path containment:
// worktrees nest inside the main checkout, so "is under my directory" would
// silently accept a sibling whenever you work from the main checkout.

const worktree = "/repo/.claude/worktrees/issue321";
const sibling = "/repo/.claude/worktrees/issue999";
const mainCheckout = "/repo";

function holder(overrides: {
  port?: number;
  pid?: number | null;
  cwd?: string | null;
  worktreeRoot?: string | null;
}) {
  return {
    port: 5173,
    pid: 42,
    cwd: sibling,
    worktreeRoot: sibling,
    ...overrides,
  };
}

async function listenOnEphemeralPort(): Promise<{
  server: Server;
  port: number;
}> {
  const server = createServer();
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string")
        throw new Error("expected a TCP address");
      resolve(address.port);
    });
  });
  return { server, port };
}

describe("decidePortOwnership", () => {
  it("allows a command that never drives the browser", () => {
    const decision = decidePortOwnership({
      command: "pnpm test",
      worktreeRoot: worktree,
      owners: [holder({})],
    });

    expect(decision.blocked).toBe(false);
  });

  it("allows a browser command aimed at a site that is not the cockpit", () => {
    const decision = decidePortOwnership({
      command: "agent-browser open https://example.com",
      worktreeRoot: worktree,
      owners: [holder({})],
    });

    expect(decision.blocked).toBe(false);
  });

  it("allows a browser command when nothing holds the ports", () => {
    const decision = decidePortOwnership({
      command: "agent-browser open http://localhost:5173",
      worktreeRoot: worktree,
      owners: [],
    });

    expect(decision.blocked).toBe(false);
  });

  it("allows a browser command when this worktree holds the port", () => {
    const decision = decidePortOwnership({
      command: "agent-browser snapshot -i",
      worktreeRoot: worktree,
      owners: [holder({ cwd: worktree, worktreeRoot: worktree })],
    });

    expect(decision.blocked).toBe(false);
  });

  it("allows a holder running from a subdirectory of this worktree", () => {
    const decision = decidePortOwnership({
      command: "agent-browser snapshot -i",
      worktreeRoot: worktree,
      owners: [
        holder({ cwd: `${worktree}/packages/web`, worktreeRoot: worktree }),
      ],
    });

    expect(decision.blocked).toBe(false);
  });

  it("blocks a browser command while a sibling worktree holds the port", () => {
    const decision = decidePortOwnership({
      command: "agent-browser snapshot -i",
      worktreeRoot: worktree,
      owners: [holder({})],
    });

    expect(decision.blocked).toBe(true);
    expect(decision.message).toContain(sibling);
    expect(decision.message).toContain("5173");
  });

  it("blocks from the main checkout when a nested worktree holds the port", () => {
    // Worktrees live under the main checkout, so containment would call this ours.
    const decision = decidePortOwnership({
      command: "agent-browser snapshot -i",
      worktreeRoot: mainCheckout,
      owners: [holder({})],
    });

    expect(decision.blocked).toBe(true);
    expect(decision.message).toContain(sibling);
  });

  it("names the fix in the block message", () => {
    const decision = decidePortOwnership({
      command: "agent-browser snapshot -i",
      worktreeRoot: worktree,
      owners: [holder({ port: 3000, pid: 7 })],
    });

    expect(decision.message).toContain("pnpm smoke");
  });

  it("reports an unidentifiable holder rather than assuming it is ours", () => {
    const decision = decidePortOwnership({
      command: "agent-browser snapshot -i",
      worktreeRoot: worktree,
      owners: [holder({ cwd: null, worktreeRoot: null })],
    });

    expect(decision.blocked).toBe(true);
  });

  it("allows a browser command aimed at a different local port", () => {
    const decision = decidePortOwnership({
      command: "agent-browser open http://localhost:8080",
      worktreeRoot: worktree,
      owners: [holder({})],
    });

    expect(decision.blocked).toBe(false);
  });

  it("blocks when the port lookup itself failed", () => {
    const decision = decidePortOwnership({
      command: "agent-browser snapshot -i",
      worktreeRoot: worktree,
      owners: [holder({ pid: null, cwd: null, worktreeRoot: null })],
    });

    expect(decision.blocked).toBe(true);
    expect(decision.message).toContain("could not be determined");
    // The refusal must not invent a dev server it never saw.
    expect(decision.message).not.toContain("held by a dev server");
  });

  it("blocks when this worktree cannot be identified either", () => {
    // Two unknowns are not a match: without both roots there is nothing to
    // compare, so the guard cannot claim the holder is ours.
    const decision = decidePortOwnership({
      command: "agent-browser snapshot -i",
      worktreeRoot: null,
      owners: [holder({ pid: null, cwd: null, worktreeRoot: null })],
    });

    expect(decision.blocked).toBe(true);
  });

  it("blocks an identified holder when this worktree is unknown", () => {
    const decision = decidePortOwnership({
      command: "agent-browser snapshot -i",
      worktreeRoot: null,
      owners: [holder({})],
    });

    expect(decision.blocked).toBe(true);
  });

  it("ignores a foreign holder on a port the command does not target", () => {
    const decision = decidePortOwnership({
      command: "agent-browser open http://localhost:5173",
      worktreeRoot: worktree,
      owners: [holder({ port: 3000, pid: 7 })],
    });

    expect(decision.blocked).toBe(false);
  });
});

describe("findPortOwners", () => {
  it("reports this process, and its worktree root, as the owner of a port it listens on", async () => {
    const { server, port } = await listenOnEphemeralPort();

    try {
      const self = findPortOwners([port]).find(
        (owner) => owner.pid === process.pid,
      );
      expect(self?.cwd).toBe(process.cwd());
      expect(self?.worktreeRoot).toBe(process.cwd());
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("reports an unknown holder when the lookup itself cannot run", () => {
    // lsof missing or refusing to run is not the same as "the port is free";
    // treating it as free would let a foreign server through unchallenged.
    const owners = findPortOwners([5173], () => {
      const failure: NodeJS.ErrnoException = new Error("spawn lsof ENOENT");
      failure.code = "ENOENT";
      throw failure;
    });

    expect(owners).toEqual([
      { port: 5173, pid: null, cwd: null, worktreeRoot: null },
    ]);
  });

  it("reports no owner when the lookup reports the port as free", () => {
    const owners = findPortOwners([5173], () => {
      const noMatch: NodeJS.ErrnoException & { status: number } = Object.assign(
        new Error("no match"),
        { status: 1 },
      );
      throw noMatch;
    });

    expect(owners).toEqual([]);
  });

  it("reports no owner for a port nothing listens on", async () => {
    const { server, port } = await listenOnEphemeralPort();
    await new Promise((resolve) => server.close(resolve));

    expect(findPortOwners([port])).toEqual([]);
  });
});
