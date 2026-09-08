import { describe, expect, it } from "vitest";
import { requireRegisteredRepo } from "../../packages/server/src/registered-repo-route";

type Calls = Array<
  { kind: "deploy-state"; path: string } | { kind: "drift"; path: string }
>;

function makeContext(repo: string | undefined) {
  return {
    req: {
      query: (name: string) => (name === "repo" ? repo : undefined),
    },
    json: (body: unknown, status: number) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  } as Parameters<typeof requireRegisteredRepo>[0];
}

function makeDependencies(
  resolveRegistered: (input: string) => Promise<{ path: string } | undefined>,
  calls: Calls,
) {
  return {
    registry: { resolveRegistered },
    deployState: {
      read: async (path: string) => {
        calls.push({ kind: "deploy-state", path });
        return { ok: true as const, primitives: [], skipped: [] };
      },
    },
    drift: {
      execute: async ({
        target,
      }: {
        target: { kind: "repo"; repoPath: string };
      }) => {
        calls.push({ kind: "drift", path: target.repoPath });
        return { ok: true as const, behind: [] };
      },
    },
  };
}

describe("registered repository route gate", () => {
  it("keeps both readers behind the canonical registration", async () => {
    const calls: Calls = [];
    const deps = makeDependencies(
      async (input) =>
        input === "/link" ? { path: "/Users/me/project" } : undefined,
      calls,
    );

    const gate = await requireRegisteredRepo(makeContext("/link"), deps);

    expect(gate.ok).toBe(true);
    if (!gate.ok) {
      throw new Error("expected a registered repository");
    }
    await gate.repo.readDeployState();
    await gate.repo.readDrift();
    expect(calls).toEqual([
      { kind: "deploy-state", path: "/Users/me/project" },
      { kind: "drift", path: "/Users/me/project" },
    ]);
  });

  it("returns the existing missing-repo refusal without calling a reader", async () => {
    const calls: Calls = [];
    const deps = makeDependencies(async () => {
      throw new Error("registry must not be consulted");
    }, calls);

    const gate = await requireRegisteredRepo(makeContext(" "), deps);

    expect(gate.ok).toBe(false);
    if (gate.ok) {
      throw new Error("expected a missing repository refusal");
    }
    expect(gate.response.status).toBe(400);
    expect(await gate.response.json()).toEqual({ error: "missing-repo" });
    expect(calls).toEqual([]);
  });

  it("returns the existing not-registered refusal without calling a reader", async () => {
    const calls: Calls = [];
    const deps = makeDependencies(async () => undefined, calls);

    const gate = await requireRegisteredRepo(makeContext("/unknown"), deps);

    expect(gate.ok).toBe(false);
    if (gate.ok) {
      throw new Error("expected an unregistered repository refusal");
    }
    expect(gate.response.status).toBe(403);
    expect(await gate.response.json()).toEqual({ error: "not-registered" });
    expect(calls).toEqual([]);
  });
});
