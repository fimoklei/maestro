// Categories saved through the real disk survive a restart of Maestro.
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CategoryList, UseCasePorts } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unreachable } from "../helpers/in-memory-app";
import { nodeApp } from "../helpers/node-app";

describe("categories on a real filesystem", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "maestro-categories-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // A fresh composition each call, as a restart builds one.
  const startMaestro = async () => {
    const harness = join(dir, "harness");
    // Not released yet: `tdd` sits in the Working harness only.
    await mkdir(join(harness, ".apm", "skills", "tdd"), { recursive: true });
    return nodeApp(
      {
        HOME: dir,
        MAESTRO_HOME: join(dir, ".maestro"),
        MAESTRO_INVENTORY_PATH: harness,
      },
      {
        git: {
          harness: unreachable<UseCasePorts["git"]["harness"]>("harness", {
            readOrigin: async () => ({
              host: "github.com",
              ownerRepo: "fimoklei/agent-harness",
            }),
            readTags: async () => [],
          }),
        },
      },
    );
  };

  it("lists the added categories again after a restart", async () => {
    const before = await startMaestro();
    for (const name of ["Writing", "Planning"]) {
      const res = await before.request("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      expect(res.status).toBe(200);
    }

    const after = await startMaestro();
    const res = await after.request("/api/categories");

    expect(await res.json()).toEqual({
      categories: [
        { name: "Planning", skills: 0, prompts: 0 },
        { name: "Writing", skills: 0, prompts: 0 },
      ],
      assignments: [],
    } satisfies CategoryList);
  });

  it("keeps a skill's category after a restart", async () => {
    const before = await startMaestro();
    await before.request("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Planning" }),
    });
    const assigned = await before.request("/api/categories/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ type: "skill", name: "tdd" }],
        category: "Planning",
      }),
    });
    expect(assigned.status).toBe(200);
    const unheld = await before.request("/api/categories/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ type: "skill", name: "gone" }],
        category: "Planning",
      }),
    });
    expect(unheld.status).toBe(404);

    const after = await startMaestro();
    const res = await after.request("/api/categories");

    expect(await res.json()).toEqual({
      categories: [{ name: "Planning", skills: 1, prompts: 0 }],
      assignments: [{ type: "skill", name: "tdd", category: "Planning" }],
    } satisfies CategoryList);
  });
});
