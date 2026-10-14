import type { BulkDeployReport, DeployTarget } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { deployWorld, HOME } from "../helpers/deploy-world";

// The production composition over an in-memory disk and Harness; only apm and
// the inventory clone's git are faked. How Deploy's batch sorts names is
// proven in the core lane; this file proves what the route answers.
const globalTarget: DeployTarget = { kind: "global" };

function world() {
  const w = deployWorld({ released: ["tdd", "review", "docs"] });
  const bulk = (body: unknown) => w.post("/api/deploy/bulk", body);
  // Deduped across tool groups: a two-tool skill lands in both.
  const globalNames = async () => {
    const res = await w.app.request("/api/deploy-state/global");
    const { tools } = (await res.json()) as {
      tools: { primitives: { name: string; version: string }[] }[];
    };
    return [
      ...new Set(
        tools.flatMap((group) =>
          group.primitives.map((p) => `${p.name}@${p.version}`),
        ),
      ),
    ];
  };
  return { ...w, bulk, globalNames };
}

describe("bulk deploy HTTP route", () => {
  it("deploys every staged skill to the target in one install", async () => {
    const w = world();

    const res = await w.bulk({
      names: ["tdd", "review"],
      target: globalTarget,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      target: globalTarget,
      deployed: [
        { name: "tdd", version: "v0.5.1" },
        { name: "review", version: "v0.5.1" },
      ],
      attention: [],
      failed: [],
    });
    expect(w.installs.map((install) => install.skills)).toEqual([
      ["tdd", "review"],
    ]);
  });

  it("answers a failed install with 200 and a report that leaks nothing", async () => {
    const w = world();
    w.answers.installRefusal = "throw";

    const res = await w.bulk({ names: ["tdd", "docs"], target: globalTarget });

    expect(res.status).toBe(200);
    const body = (await res.json()) as BulkDeployReport;
    expect(body.failed).toEqual([
      { error: "deploy-failed", names: ["tdd", "docs"] },
    ]);
    expect(JSON.stringify(body)).not.toContain("token in stderr");
  });

  it("holds back a hand-written copy while a failing install fails the rest on one line", async () => {
    // A copy no deploy recorded: it holds only its own name. An edited deployed
    // copy would hold the whole batch, since one install rewrites every copy.
    const w = world();
    w.disk.write(
      `${HOME}/.claude/skills/review/SKILL.md`,
      "# review, hand-written\n",
    );
    w.answers.installRefusal = "throw";

    const res = await w.bulk({
      names: ["review", "tdd", "docs"],
      target: globalTarget,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as BulkDeployReport;
    expect(body.attention).toEqual([
      expect.objectContaining({
        name: "review",
        forceable: true,
        copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    ]);
    expect(body.failed).toEqual([
      { error: "deploy-failed", names: ["tdd", "docs"] },
    ]);
    expect(body.deployed).toEqual([]);
  });

  it("puts every deployed skill into the global deploy-state read", async () => {
    const w = world();

    await w.bulk({ names: ["tdd", "review"], target: globalTarget });

    expect(await w.globalNames()).toEqual(["tdd@v0.5.1", "review@v0.5.1"]);
  });

  it("leaves the baseline as it was when the one install fails", async () => {
    const w = world();
    await w.bulk({ names: ["tdd"], target: globalTarget });
    w.answers.installRefusal = "throw";

    await w.bulk({ names: ["docs", "review"], target: globalTarget });

    expect(await w.globalNames()).toEqual(["tdd@v0.5.1"]);
  });

  it("returns 400 for a body without a names array", async () => {
    const w = world();

    expect((await w.bulk({ target: globalTarget })).status).toBe(400);
  });
});
