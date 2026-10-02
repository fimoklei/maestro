import { describe, expect, it } from "vitest";
import { requireRegisteredRepo } from "../../packages/server/src/registered-repo-route";

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

describe("registered repository route gate", () => {
  it("returns the canonical registered path, never the query string", async () => {
    const registry = {
      resolveRegistered: async (input: string) =>
        input === "/link" ? { path: "/Users/me/project" } : undefined,
    };

    const gate = await requireRegisteredRepo(makeContext("/link"), registry);

    expect(gate).toEqual({ ok: true, path: "/Users/me/project" });
  });

  it("returns the missing-repo refusal without consulting the registry", async () => {
    const registry = {
      resolveRegistered: async () => {
        throw new Error("registry must not be consulted");
      },
    };

    const gate = await requireRegisteredRepo(makeContext(" "), registry);

    expect(gate.ok).toBe(false);
    if (gate.ok) {
      throw new Error("expected a missing repository refusal");
    }
    expect(gate.response.status).toBe(400);
    expect(await gate.response.json()).toEqual({ error: "missing-repo" });
  });

  it("returns the not-registered refusal for a path outside the registry", async () => {
    const registry = { resolveRegistered: async () => undefined };

    const gate = await requireRegisteredRepo(makeContext("/unknown"), registry);

    expect(gate.ok).toBe(false);
    if (gate.ok) {
      throw new Error("expected an unregistered repository refusal");
    }
    expect(gate.response.status).toBe(403);
    expect(await gate.response.json()).toEqual({ error: "not-registered" });
  });
});
