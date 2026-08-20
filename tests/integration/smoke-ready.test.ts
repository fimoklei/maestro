import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { writeSmokeMarker } from "../../scripts/seed-sandbox.mjs";
import {
  identifySmokeInstance,
  readSmokeMarker,
  seedCockpit,
  waitForCockpit,
} from "../../scripts/smoke-ready.mjs";

// `pnpm smoke` never exits, so nothing tells the agent when the cockpit is up.
// Blind `sleep` calls filled that gap. This step waits for a real answer and
// then seeds through the API, so a screenshot starts from a populated screen
// (.claude/rules/design.md, "Verify before done").

function clock(startMs = 0) {
  let ms = startMs;
  return {
    now: () => ms,
    sleep: async (waitMs: number) => {
      ms += waitMs;
    },
    elapsed: () => ms - startMs,
  };
}

describe("waitForCockpit", () => {
  it("returns as soon as the cockpit answers", async () => {
    const time = clock();
    let calls = 0;

    const result = await waitForCockpit({
      probe: async () => {
        calls += 1;
        return true;
      },
      now: time.now,
      sleep: time.sleep,
    });

    expect(result.ready).toBe(true);
    expect(calls).toBe(1);
    expect(time.elapsed()).toBe(0);
  });

  it("keeps polling while the cockpit is still starting", async () => {
    const time = clock();
    let calls = 0;

    const result = await waitForCockpit({
      probe: async () => {
        calls += 1;
        return calls >= 4;
      },
      intervalMs: 250,
      now: time.now,
      sleep: time.sleep,
    });

    expect(result.ready).toBe(true);
    expect(calls).toBe(4);
    expect(time.elapsed()).toBe(750);
  });

  it("gives up at the deadline rather than waiting forever", async () => {
    const time = clock();

    const result = await waitForCockpit({
      probe: async () => false,
      timeoutMs: 1_000,
      intervalMs: 250,
      now: time.now,
      sleep: time.sleep,
    });

    expect(result.ready).toBe(false);
    expect(time.elapsed()).toBeLessThanOrEqual(1_000);
  });

  it("treats a probe that throws as not-yet-up, not as a crash", async () => {
    // A refused connection is the normal state while the server is booting.
    const time = clock();
    let calls = 0;

    const result = await waitForCockpit({
      probe: async () => {
        calls += 1;
        if (calls === 1) throw new Error("ECONNREFUSED");
        return true;
      },
      now: time.now,
      sleep: time.sleep,
    });

    expect(result.ready).toBe(true);
  });
});

describe("seedCockpit", () => {
  function recorder(
    respond: (path: string) => { status: number; body: unknown },
  ) {
    const calls: { path: string; body: unknown }[] = [];
    return {
      calls,
      request: async (path: string, body: unknown) => {
        calls.push({ path, body });
        return respond(path);
      },
    };
  }

  const happy = (path: string) =>
    path === "/api/inventory/connect"
      ? {
          status: 200,
          body: { inventoryPath: "/home/Projects/x", primitiveCount: 12 },
        }
      : {
          status: 201,
          body: { repos: [{ path: "/home/Projects/checkout-service" }] },
        };

  it("connects the inventory before registering the repo", async () => {
    const { calls, request } = recorder(happy);

    await seedCockpit({
      request,
      inventoryPath: "/home/Projects/agent-harness",
      repoPath: "/home/Projects/checkout-service",
    });

    expect(calls).toEqual([
      {
        path: "/api/inventory/connect",
        body: { path: "/home/Projects/agent-harness" },
      },
      {
        path: "/api/registry/repos",
        body: { path: "/home/Projects/checkout-service" },
      },
    ]);
  });

  it("reports what it seeded", async () => {
    const { request } = recorder(happy);

    const report = await seedCockpit({
      request,
      inventoryPath: "/home/Projects/agent-harness",
      repoPath: "/home/Projects/checkout-service",
    });

    expect(report).toEqual({ primitiveCount: 12, repoCount: 1 });
  });

  it("fails loudly when connect is refused", async () => {
    const { request } = recorder(() => ({
      status: 400,
      body: { error: "not-an-inventory", message: "No skills directory." },
    }));

    await expect(
      seedCockpit({
        request,
        inventoryPath: "/home/Projects/agent-harness",
        repoPath: "/home/Projects/checkout-service",
      }),
    ).rejects.toThrow(/No skills directory/);
  });

  it("does not register the repo when connect failed", async () => {
    const { calls, request } = recorder(() => ({
      status: 400,
      body: { error: "not-an-inventory", message: "No skills directory." },
    }));

    await expect(
      seedCockpit({
        request,
        inventoryPath: "/home/Projects/agent-harness",
        repoPath: "/home/Projects/checkout-service",
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("refuses an inventory that connects but holds no primitives", async () => {
    // An empty cockpit is the same class of failure as an unanswered one: it
    // passes as green and every UI check downstream reads nothing (issue #544).
    const { request } = recorder((path) =>
      path === "/api/inventory/connect"
        ? {
            status: 200,
            body: {
              inventoryPath: "/home/Projects/agent-harness",
              primitiveCount: 0,
            },
          }
        : { status: 201, body: { repos: [] } },
    );

    await expect(
      seedCockpit({
        request,
        inventoryPath: "/home/Projects/agent-harness",
        repoPath: "/home/Projects/checkout-service",
      }),
    ).rejects.toThrow(/agent-harness.*no primitives.*\.apm\/skills/s);
  });

  it("does not register the repo against an empty inventory", async () => {
    const { calls, request } = recorder(() => ({
      status: 200,
      body: {
        inventoryPath: "/home/Projects/agent-harness",
        primitiveCount: 0,
      },
    }));

    await expect(
      seedCockpit({
        request,
        inventoryPath: "/home/Projects/agent-harness",
        repoPath: "/home/Projects/checkout-service",
      }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("fails loudly when registration is refused", async () => {
    const { request } = recorder((path) =>
      path === "/api/inventory/connect"
        ? { status: 200, body: { inventoryPath: "/x", primitiveCount: 1 } }
        : {
            status: 400,
            body: { error: "not-a-directory", message: "Not a directory." },
          },
    );

    await expect(
      seedCockpit({
        request,
        inventoryPath: "/home/Projects/agent-harness",
        repoPath: "/home/Projects/checkout-service",
      }),
    ).rejects.toThrow(/Not a directory/);
  });
});

// Answering on the cockpit's ports does not make a server the smoke instance.
// A sandbox left behind by a killed run, plus a plain `pnpm dev` on the same
// ports, would otherwise write the rehearsal's paths into the real ~/.maestro.
// So the launcher leaves its process id in the sandbox, and this step refuses
// unless every cockpit listener belongs to that same run.
describe("identifySmokeInstance", () => {
  const marker = { launcherPid: 500 };
  const holders = (api: number[], web: number[]) => [
    { port: 3000, pids: api },
    { port: 5173, pids: web },
  ];
  const ours = holders([501], [502]);

  it("accepts a cockpit whose listeners are all the launcher's", () => {
    const decision = identifySmokeInstance({
      marker,
      holders: ours,
      processGroupOf: () => 500,
    });

    expect(decision.ok).toBe(true);
  });

  it("refuses when the sandbox holds no marker", () => {
    // A sandbox left behind by a killed run: the files exist, the run does not.
    const decision = identifySmokeInstance({
      marker: null,
      holders: ours,
      processGroupOf: () => 500,
    });

    expect(decision.ok).toBe(false);
    expect(decision.reason).toMatch(/pnpm smoke/);
  });

  it("names the takeover when something else holds a port", () => {
    // The hijack this check exists for reads as "you forgot to start it"
    // otherwise, which sends the reader the wrong way (issue #453).
    const decision = identifySmokeInstance({
      marker: null,
      holders: ours,
      processGroupOf: () => 500,
    });

    expect(decision.reason).toMatch(/pid 501/);
    expect(decision.reason).toMatch(/took the port|another worktree/i);
  });

  it("refuses a server belonging to another run", () => {
    // A plain `pnpm dev`, or a sibling worktree, answering on the same port.
    const decision = identifySmokeInstance({
      marker,
      holders: holders([900], [901]),
      processGroupOf: () => 899,
    });

    expect(decision.ok).toBe(false);
    expect(decision.reason).toMatch(/not this smoke run/i);
  });

  // The screenshot comes from the web app on 5173, so owning the API port
  // alone proves nothing about what the browser renders (issue #453 review).
  it("refuses a foreign web listener even when the API port is ours", () => {
    const decision = identifySmokeInstance({
      marker,
      holders: holders([501], [900]),
      processGroupOf: (pid) => (pid === 501 ? 500 : 899),
    });

    expect(decision.ok).toBe(false);
    expect(decision.reason).toMatch(/5173/);
  });

  it("refuses when nothing holds the web port", () => {
    const decision = identifySmokeInstance({
      marker,
      holders: holders([501], []),
      processGroupOf: () => 500,
    });

    expect(decision.ok).toBe(false);
    expect(decision.reason).toMatch(/5173/);
  });

  it("refuses when nothing holds the server port", () => {
    const decision = identifySmokeInstance({
      marker,
      holders: holders([], [502]),
      processGroupOf: () => 500,
    });

    expect(decision.ok).toBe(false);
    expect(decision.reason).toMatch(/3000/);
  });

  it("refuses a second, foreign listener sharing a port", () => {
    // lsof can name more than one holder; owning the first proves nothing
    // about the rest.
    const decision = identifySmokeInstance({
      marker,
      holders: holders([501, 900], [502]),
      processGroupOf: (pid) => (pid === 900 ? 899 : 500),
    });

    expect(decision.ok).toBe(false);
    expect(decision.reason).toMatch(/pid 900/);
  });

  it("refuses when the process group cannot be read", () => {
    // Unknown ownership is not ownership: fail closed, as the port guard does.
    const decision = identifySmokeInstance({
      marker,
      holders: ours,
      processGroupOf: () => null,
    });

    expect(decision.ok).toBe(false);
  });
});

// `--check` re-asks who owns the port before each screenshot (issue #453), so
// it must answer without the wait `smoke:ready` pays. That it seeds nothing is
// structural: `check()` never reaches `seedCockpit`.
describe("smoke-ready --check", () => {
  const script = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "scripts",
    "smoke-ready.mjs",
  );

  // Comfortably under the 60s wait, comfortably over an honest check.
  const budgetMs = 10_000;

  const runCheck = () =>
    spawnSync(process.execPath, [script, "--check"], {
      encoding: "utf8",
      timeout: budgetMs,
    });

  it(
    "answers without waiting out the cockpit deadline",
    () => {
      const result = runCheck();

      // Killed by the timeout means it fell into the wait-for-cockpit loop.
      expect(result.signal).toBeNull();
      expect(typeof result.status).toBe("number");
    },
    budgetMs * 2,
  );
});

describe("the smoke marker on disk", () => {
  it("reads back what the launcher wrote", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "maestro-marker-"));
    try {
      writeSmokeMarker(sandbox, { launcherPid: 4321 });

      expect(readSmokeMarker(sandbox)).toEqual({ launcherPid: 4321 });
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it("reports no marker for a sandbox left behind without one", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "maestro-marker-"));
    try {
      expect(readSmokeMarker(sandbox)).toBeNull();
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });
});
