import { describe, expect, it } from "vitest";
import { seedCockpit, waitForCockpit } from "../../scripts/smoke-ready.mjs";

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
