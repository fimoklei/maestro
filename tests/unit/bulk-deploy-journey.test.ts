// The whole bulk-deploy chain over the production composition (#1039). Only
// apm and the inventory clone's git are faked.
import type { BulkDeployReport } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { deployWorld, HOME } from "../helpers/deploy-world";

const SKILLS = ["tdd", "review", "docs"];

describe("bulk deploy journey", () => {
  it("installs the clean names at once and deploys the held one on its own receipt", async () => {
    const w = deployWorld({ released: SKILLS });
    w.disk.write(`${HOME}/.claude/skills/docs/SKILL.md`, "hand-written\n");

    const bulk = await w.post("/api/deploy/bulk", {
      names: SKILLS,
      target: { kind: "global" },
    });
    const report = (await bulk.json()) as BulkDeployReport;

    expect(report.deployed).toEqual([
      { name: "tdd", version: "v0.5.1" },
      { name: "review", version: "v0.5.1" },
    ]);
    expect(report.attention).toEqual([
      {
        name: "docs",
        error: "deployed-unverifiable",
        forceable: true,
        copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
        blockingCopies: [{ name: "docs", verdict: "unverified" }],
      },
    ]);
    expect(w.installs.map((install) => install.skills)).toEqual([
      ["tdd", "review"],
    ]);

    const single = await w.post("/api/deploy", {
      type: "skill",
      name: "docs",
      target: { kind: "global" },
      confirmedCopyReceipt: report.attention[0]?.copyReceipt,
    });
    expect(single.status).toBe(200);

    const state = await w.app.request("/api/deploy-state/global");
    const { tools } = (await state.json()) as {
      tools: { primitives: { name: string; version: string }[] }[];
    };
    const names = new Set(
      tools.flatMap((group) =>
        group.primitives.map((p) => `${p.name}@${p.version}`),
      ),
    );
    expect([...names].sort()).toEqual([
      "docs@v0.5.1",
      "review@v0.5.1",
      "tdd@v0.5.1",
    ]);
  });
});
