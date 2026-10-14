import type { BulkRemoveReport, DeployTarget } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { deployWorld, lockfilePath } from "../helpers/deploy-world";

// The production composition over an in-memory disk; only apm is faked. Each
// target's refusals are proven by Remove's batch in the core lane; this file
// proves what the route answers.
const REF = "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.5.1";
const repoA: DeployTarget = { kind: "repo", repoPath: "/work/a" };
const repoB: DeployTarget = { kind: "repo", repoPath: "/work/b" };
const globalTarget: DeployTarget = { kind: "global" };

const lockfile = [
  "lockfile_version: '1'",
  "dependencies:",
  "- repo_url: fimoklei/agent-harness",
  "  host: github.com",
  "  resolved_ref: v0.5.1",
  "  virtual_path: .apm/skills/tdd",
  "  package_type: claude_skill",
  "",
].join("\n");

async function world() {
  const w = deployWorld({ detectedTools: ["codex"] });
  await w.register("/work/a");
  await w.register("/work/b");
  for (const target of [repoA, repoB, globalTarget]) {
    w.disk.write(lockfilePath(target), lockfile);
  }
  const bulk = (body: unknown) => w.post("/api/deploy/remove/bulk", body);
  // Each target's own preflight receipt, forwarded untouched (#364).
  const confirmed = async (targets: DeployTarget[]) => {
    const entries = [];
    for (const target of targets) {
      const response = await w.post("/api/deploy/remove/preflight", {
        type: "skill",
        name: "tdd",
        target,
      });
      const { receipt } = (await response.json()) as { receipt?: string };
      entries.push({ target, confirmedRemovalReceipt: receipt });
    }
    return entries;
  };
  return { ...w, bulk, confirmed };
}

describe("bulk remove HTTP route", () => {
  it("removes the skill from every target in one call and reports the successes", async () => {
    const w = await world();

    const response = await w.bulk({
      name: "tdd",
      targets: await w.confirmed([globalTarget, repoA]),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "tdd",
      removed: [
        { target: globalTarget, version: "v0.5.1" },
        { target: repoA, version: "v0.5.1" },
      ],
      refused: [],
      failed: [],
    });
    expect(w.uninstalls).toEqual([
      { target: globalTarget, ref: REF },
      { target: repoA, ref: REF },
    ]);
  });

  it("answers 200 past a failing target, leaking nothing apm printed", async () => {
    const w = await world();
    w.answers.uninstallAnswer = (target) =>
      target.kind === "repo" && target.repoPath === "/work/a"
        ? "throw"
        : "removed";

    const response = await w.bulk({
      name: "tdd",
      targets: await w.confirmed([repoA, repoB]),
    });

    expect(response.status).toBe(200);
    const report = (await response.json()) as BulkRemoveReport;
    expect(report.failed).toEqual([{ target: repoA, reason: "remove-failed" }]);
    expect(report.removed).toEqual([{ target: repoB, version: "v0.5.1" }]);
    expect(JSON.stringify(report)).not.toContain("token in stderr");
  });

  it("rejects a receipt that is not even token-shaped, at the edge", async () => {
    const w = await world();

    const response = await w.bulk({
      name: "tdd",
      targets: [{ target: repoA, confirmedRemovalReceipt: "nope" }],
    });

    expect(response.status).toBe(400);
    expect(w.uninstalls).toEqual([]);
  });

  it("returns 400 for a body without a targets array", async () => {
    const w = await world();

    expect((await w.bulk({ name: "tdd" })).status).toBe(400);
  });

  it("returns 400 for a refusal reason outside the known vocabulary", async () => {
    const w = await world();

    const response = await w.bulk({
      name: "tdd",
      targets: [{ target: repoA, refused: "<script>alert(1)</script>" }],
    });

    expect(response.status).toBe(400);
  });

  it("takes no path from the client for the global target", async () => {
    const w = await world();
    const [priced] = await w.confirmed([globalTarget]);

    const response = await w.bulk({
      name: "tdd",
      targets: [
        {
          target: { kind: "global", repoPath: "/etc" },
          confirmedRemovalReceipt: priced?.confirmedRemovalReceipt,
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(w.uninstalls).toEqual([{ target: globalTarget, ref: REF }]);
  });
});
