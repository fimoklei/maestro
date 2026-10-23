import type { ApmDriverPort } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryApp, unreachable } from "../helpers/in-memory-app";

const REPO = "/work/app";

// A registered repo one release behind, and a connected Harness clone.
async function world() {
  const harness = new InMemoryHarnessGit().settled({ tdd: "first" }, "aaa");
  const app = inMemoryApp({
    env: {
      HOME: "/home",
      MAESTRO_HOME: "/maestro-home",
      MAESTRO_INVENTORY_PATH: "/harness",
    },
    fs: new InMemoryFileSystem({
      directories: { [REPO]: REPO, "/harness": "/harness" },
      files: { [`${REPO}/.git`]: "gitdir: elsewhere" },
    }),
    apm: unreachable<ApmDriverPort>("apm", {
      checkOutdated: async () => ({
        ok: true,
        behind: [{ name: "tdd", current: "v0.1.0", latest: "v0.2.0" }],
      }),
    }),
    git: { harness },
  });
  const registered = await app.request("/api/registry/repos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: REPO }),
  });
  expect(registered.status).toBe(201);
  const readDrift = () =>
    app.request(`/api/drift?repo=${encodeURIComponent(REPO)}`);
  return { app, harness, readDrift };
}

describe("Harness fetches behind the gate", () => {
  it("fetches the Harness once for ten Drift reads arriving together", async () => {
    const { harness, readDrift } = await world();

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => readDrift()),
    );

    expect(responses.map((res) => res.status)).toEqual(
      Array.from({ length: 10 }, () => 200),
    );
    expect(harness.fetches).toBe(1);
  });

  it("records the Drift read's fetch as the Harness freshness", async () => {
    const { app, readDrift } = await world();

    await readDrift();
    const res = await app.request("/api/harness");

    expect(await res.json()).toMatchObject({
      freshness: { outcome: "fetched" },
    });
  });

  it("fetches again for a Harness refresh right after a Drift read", async () => {
    const { app, harness, readDrift } = await world();

    await readDrift();
    const res = await app.request("/api/harness/refresh", { method: "POST" });

    expect(res.status).toBe(200);
    expect(harness.fetches).toBe(2);
  });

  it("reuses a Drift read's fetch for a Drift read right after it", async () => {
    const { harness, readDrift } = await world();

    await readDrift();
    await readDrift();

    expect(harness.fetches).toBe(1);
  });
});
