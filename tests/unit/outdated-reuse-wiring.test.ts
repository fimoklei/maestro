import type { ApmDriverPort, ReleasePlan } from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  InMemoryHarnessGit,
  treeHash,
} from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryApp, unreachable } from "../helpers/in-memory-app";
import { stubReview } from "../helpers/stub-review";

const REPO = "/work/app";

// A registered repo one release behind. The Harness clone holds `tdd` changed
// since v0.1.0, a new `research` and a locally deleted `old-skill`.
async function world() {
  const harness = new InMemoryHarnessGit();
  harness.commit("released", { tdd: "first", "old-skill": "legacy" });
  harness.commit(
    "head",
    { tdd: "second", "old-skill": "legacy" },
    { parent: "released" },
  );
  harness.tip = "head";
  harness.head = "head";
  harness.working = { tdd: "second", research: "new" };
  harness.tags = [{ name: "v0.1.0", commit: "released" }];
  let outdatedRuns = 0;
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
      checkOutdated: async () => {
        outdatedRuns += 1;
        return {
          ok: true,
          behind: [{ name: "tdd", current: "v0.1.0", latest: "v0.2.0" }],
        };
      },
    }),
    git: { harness },
    gh: stubReview(),
  });
  const registered = await app.request("/api/registry/repos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: REPO }),
  });
  expect(registered.status).toBe(201);
  const post = (path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const readDrift = async () => {
    const res = await app.request(
      `/api/drift?repo=${encodeURIComponent(REPO)}`,
    );
    expect(res.status).toBe(200);
  };
  return { app, post, readDrift, outdatedRuns: () => outdatedRuns };
}

describe("apm outdated reuse in the composition", () => {
  it("reuses a Target's answer for a second Drift read right after", async () => {
    const { readDrift, outdatedRuns } = await world();

    await readDrift();
    await readDrift();

    expect(outdatedRuns()).toBe(1);
  });

  it("asks apm again after a Release", async () => {
    const { app, post, readDrift, outdatedRuns } = await world();
    await readDrift();

    // The plan route answers a ReleasePlan; the release confirms it as read.
    const plan = (await (
      await app.request("/api/harness/release-plan")
    ).json()) as ReleasePlan;
    const released = await post("/api/harness/release", {
      step: plan.proposedStep,
      previousTag: plan.previousTag,
      previousTagCommit: plan.previousTagCommit,
      revision: plan.revision,
    });
    expect(released.status).toBe(200);
    await readDrift();

    expect(outdatedRuns()).toBe(2);
  });

  it("asks apm again after a Promote", async () => {
    const { post, readDrift, outdatedRuns } = await world();
    await readDrift();

    const promoted = await post("/api/harness/promote", { name: "research" });
    expect(promoted.status).toBe(200);
    await readDrift();

    expect(outdatedRuns()).toBe(2);
  });

  it("asks apm again after a Promote deletion", async () => {
    const { post, readDrift, outdatedRuns } = await world();
    await readDrift();

    const promoted = await post("/api/harness/promote/deletion", {
      name: "old-skill",
      seenRemoteTree: treeHash("legacy"),
    });
    expect(promoted.status).toBe(200);
    await readDrift();

    expect(outdatedRuns()).toBe(2);
  });
});
