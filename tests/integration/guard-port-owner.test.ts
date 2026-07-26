import { createServer, type Server } from "node:net";
import { describe, expect, it } from "vitest";
import {
  decideCockpitReadiness,
  decidePortOwnership,
  findPortOwners,
  readSandboxState,
  resolveProjectDir,
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

// A running cockpit is not the same as a usable one: under `pnpm smoke` it
// starts unconnected, so a screenshot taken before seeding shows the connect
// gate instead of the screen that was changed. The guard answers that too,
// because a rule the agent has to remember is a rule that gets skipped
// (reflection-notes.md, "the finding underneath every other finding").
describe("decideCockpitReadiness", () => {
  const seeded = {
    exists: true,
    inventoryPath: "/sandbox/home/Projects/agent-harness",
    repos: [{ path: "/sandbox/home/Projects/checkout-service" }],
  };

  it("allows a command that never drives the browser", () => {
    const decision = decideCockpitReadiness({
      command: "pnpm test",
      sandbox: { exists: true, inventoryPath: null, repos: [] },
    });

    expect(decision.blocked).toBe(false);
  });

  it("allows a browser command when the sandbox is fully seeded", () => {
    const decision = decideCockpitReadiness({
      command: "agent-browser snapshot -i",
      sandbox: seeded,
    });

    expect(decision.blocked).toBe(false);
  });

  it("allows a browser command when no smoke sandbox exists at all", () => {
    // Nothing to be ready: the cockpit is not in rehearsal mode, so this guard
    // has no claim to make. Blocking here would be a false positive.
    const decision = decideCockpitReadiness({
      command: "agent-browser snapshot -i",
      sandbox: { exists: false, inventoryPath: null, repos: [] },
    });

    expect(decision.blocked).toBe(false);
  });

  it("blocks when the smoke cockpit has no inventory connected", () => {
    const decision = decideCockpitReadiness({
      command: "agent-browser snapshot -i",
      sandbox: { ...seeded, inventoryPath: null },
    });

    expect(decision.blocked).toBe(true);
    expect(decision.message).toContain("pnpm smoke:ready");
  });

  it("blocks when the smoke cockpit has no repo registered", () => {
    const decision = decideCockpitReadiness({
      command: "agent-browser open http://localhost:5173",
      sandbox: { ...seeded, repos: [] },
    });

    expect(decision.blocked).toBe(true);
    expect(decision.message).toContain("pnpm smoke:ready");
  });

  it("ignores a browser command aimed away from the cockpit", () => {
    const decision = decideCockpitReadiness({
      command: "agent-browser open https://example.com",
      sandbox: { ...seeded, inventoryPath: null },
    });

    expect(decision.blocked).toBe(false);
  });
});

// The guard reads whole Bash commands, so a mention of the tool is not a use of
// it: naming it inside a commit message once blocked the commit itself. Only a
// command position counts — start of line, or after a shell operator.
describe("what counts as a browser command", () => {
  const foreign = { port: 5173, pid: 42, cwd: sibling, worktreeRoot: sibling };

  it("allows a command that only mentions the tool in text", () => {
    const decision = decidePortOwnership({
      command: "git commit -m 'the agent-browser guard now checks seeding'",
      worktreeRoot: worktree,
      owners: [foreign],
    });

    expect(decision.blocked).toBe(false);
  });

  it("still blocks the tool run after a shell operator", () => {
    const decision = decidePortOwnership({
      command: "pnpm smoke:ready && agent-browser snapshot -i",
      worktreeRoot: worktree,
      owners: [foreign],
    });

    expect(decision.blocked).toBe(true);
  });

  it("still blocks the tool run with a leading environment variable", () => {
    const decision = decidePortOwnership({
      command: "DEBUG=1 agent-browser snapshot -i",
      worktreeRoot: worktree,
      owners: [foreign],
    });

    expect(decision.blocked).toBe(true);
  });
});

describe("readSandboxState", () => {
  it("reports an absent sandbox rather than an empty one", () => {
    expect(readSandboxState("/nowhere/.maestro-sandbox")).toEqual({
      exists: false,
      inventoryPath: null,
      repos: [],
    });
  });
});

// Which directory the guard calls "ours" decides every comparison above it.
// CLAUDE_PROJECT_DIR is pinned to the directory the session launched from and
// does not follow EnterWorktree; the hook payload's cwd does. Preferring the
// env var made the guard compare a worktree's own dev server against the launch
// directory, so every screenshot from a worktree was refused.
describe("resolveProjectDir", () => {
  it("prefers the session cwd over the launch directory", () => {
    expect(
      resolveProjectDir({
        payload: { cwd: worktree },
        env: { CLAUDE_PROJECT_DIR: mainCheckout },
      }),
    ).toBe(worktree);
  });

  it("falls back to the launch directory when the payload carries no cwd", () => {
    expect(
      resolveProjectDir({
        payload: {},
        env: { CLAUDE_PROJECT_DIR: mainCheckout },
      }),
    ).toBe(mainCheckout);
  });

  it("resolves to nothing when neither source names a directory", () => {
    expect(resolveProjectDir({ payload: {}, env: {} })).toBeUndefined();
  });
});
