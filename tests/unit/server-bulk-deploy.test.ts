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
  // Global's one skill list: a two-tool skill is listed once.
  const globalNames = async () => {
    const res = await w.app.request("/api/deploy-state/global");
    const { primitives } = (await res.json()) as {
      primitives: { name: string; version: string }[];
    };
    return primitives.map((p) => `${p.name}@${p.version}`);
  };
  return { ...w, bulk, globalNames };
}

describe("bulk deploy HTTP route", () => {
  it("deploys every staged skill to the target in one install", async () => {
    const w = world();
    w.answers.releasedFiles = "as-installed";

    const res = await w.bulk({
      names: ["tdd", "review"],
      target: globalTarget,
    });

    expect(res.status).toBe(200);
    const written = [
      { name: "tdd", outcome: "written" },
      { name: "review", outcome: "written" },
    ];
    expect(await res.json()).toEqual({
      target: globalTarget,
      deployed: [
        { name: "tdd", version: "v0.5.1" },
        { name: "review", version: "v0.5.1" },
      ],
      attention: [],
      failed: [],
      outcome: {
        release: "v0.5.1",
        folders: [
          {
            path: "~/.claude/skills",
            tool: "claude",
            written: true,
            skills: written,
          },
          {
            path: "~/.agents/skills",
            tool: "codex",
            written: true,
            skills: written,
          },
        ],
      },
    });
    expect(w.installs.map((install) => install.skills)).toEqual([
      ["tdd", "review"],
    ]);
  });

  it("names each Global folder's missing skill when the install landed short", async () => {
    const w = world();
    w.answers.releasedFiles = "as-installed";
    w.answers.lands = (skills, tool) =>
      tool === "codex" ? skills.filter((name) => name !== "tdd") : skills;

    const res = await w.bulk({
      names: ["tdd", "review"],
      target: globalTarget,
    });

    const body = (await res.json()) as BulkDeployReport;
    expect(body.failed).toEqual([
      { error: "deploy-incomplete", names: ["tdd", "review"] },
    ]);
    expect(
      body.outcome?.folders.map((folder) => [folder.path, folder.skills]),
    ).toEqual([
      [
        "~/.claude/skills",
        [
          { name: "tdd", outcome: "written" },
          { name: "review", outcome: "written" },
        ],
      ],
      [
        "~/.agents/skills",
        [
          { name: "tdd", outcome: "missing" },
          { name: "review", outcome: "written" },
        ],
      ],
    ]);
  });

  it("reads the folders again after Retry deploy completes the install", async () => {
    const w = world();
    w.answers.releasedFiles = "as-installed";
    w.answers.lands = (skills, tool) =>
      tool === "codex" ? skills.filter((name) => name !== "tdd") : skills;
    await w.bulk({ names: ["tdd"], target: globalTarget });
    w.answers.lands = (skills) => skills;

    const res = await w.post("/api/deploy/retry", { target: globalTarget });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      outcome?: BulkDeployReport["outcome"];
    };
    expect(body.outcome?.folders.map((folder) => folder.skills)).toEqual([
      [{ name: "tdd", outcome: "written" }],
      [{ name: "tdd", outcome: "written" }],
    ]);
  });

  it("lists a folder the deploy skipped, its tool not detected", async () => {
    const w = world();
    w.answers.releasedFiles = "as-installed";
    w.answers.detectedTools = ["claude"];

    const res = await w.bulk({ names: ["tdd"], target: globalTarget });

    const body = (await res.json()) as BulkDeployReport;
    expect(body.outcome?.folders[1]).toEqual({
      path: "~/.agents/skills",
      tool: "codex",
      written: false,
      skills: [],
    });
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
