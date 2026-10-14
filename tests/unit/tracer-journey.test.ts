import { describe, expect, it } from "vitest";
import { deployWorld } from "../helpers/deploy-world";

// Each step is covered elsewhere; this file proves they chain.

const LATEST_TAG = "v0.5.1";
const REPO = "/work/app";

describe("the tracer journey through one cockpit", () => {
  it("registers a repo, lists the inventory, deploys into it, and reads it back", async () => {
    const w = deployWorld({ released: ["tdd"] });
    // Released, not merely on disk: Inventory answers from the release (#841).
    w.harness.commit("released", {
      tdd: "---\nname: tdd\ndescription: Test-driven development loop\n---\n",
    });
    w.disk.write(`${REPO}/.git`, "gitdir: elsewhere");

    const registered = await w.post("/api/registry/repos", { path: REPO });
    expect(registered.status).toBe(201);
    const { repos } = (await registered.json()) as {
      repos: { path: string }[];
    };
    const registeredPath = repos[0]?.path;
    expect(registeredPath).toBeDefined();

    const inventory = await w.app.request("/api/inventory/primitives");
    expect(await inventory.json()).toEqual({
      primitives: [
        {
          type: "skill",
          name: "tdd",
          description: "Test-driven development loop",
        },
      ],
    });

    // The path comes from the registry's own answer.
    const deployed = await w.post("/api/deploy", {
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: registeredPath },
    });
    expect(deployed.status).toBe(200);
    expect(await deployed.json()).toEqual({
      deployed: { type: "skill", name: "tdd", version: LATEST_TAG },
    });

    const state = await w.app.request(
      `/api/deploy-state?repo=${encodeURIComponent(REPO)}`,
    );
    expect(state.status).toBe(200);
    expect(await state.json()).toMatchObject({
      primitives: [{ type: "skill", name: "tdd", version: LATEST_TAG }],
    });
  });
});
