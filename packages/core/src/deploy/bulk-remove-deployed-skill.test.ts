import { describe, expect, it } from "vitest";
import { BulkRemoveDeployedSkill } from "./bulk-remove-deployed-skill";
import type { DeployTarget } from "./deploy-skill";
import type { RemoveDeployedSkill } from "./remove-deployed-skill";

// A stand-in for RemoveDeployedSkill.execute that answers from a scripted table
// keyed by target, and records what it was handed. The per-target guards live in
// RemoveDeployedSkill (tested there); a bulk run only orchestrates them.
type Scripted = Awaited<ReturnType<RemoveDeployedSkill["execute"]>>;

const key = (target: DeployTarget) =>
  target.kind === "global" ? "global" : target.repoPath;

type Call = {
  key: string;
  name: string;
  token: string | undefined;
  receipt?: string;
};

function fakeRemove(
  script: Record<string, Scripted>,
  calls?: Call[],
): Pick<RemoveDeployedSkill, "execute"> {
  return {
    async execute(input) {
      calls?.push({
        key: key(input.target),
        name: input.name,
        token: input.confirmedReclaimToken,
        receipt: input.confirmedRemovalReceipt,
      });
      const result = script[key(input.target)];
      if (!result) {
        throw new Error(`no scripted result for ${key(input.target)}`);
      }
      return result;
    },
  };
}

const global: DeployTarget = { kind: "global" };
const repo = (path: string): DeployTarget => ({ kind: "repo", repoPath: path });

function ok(version: string): Scripted {
  return {
    ok: true,
    removed: { type: "skill", name: "tdd", version, scope: { kind: "repo" } },
  };
}

describe("BulkRemoveDeployedSkill", () => {
  it("removes the skill from every target and collects the successes", async () => {
    const bulk = new BulkRemoveDeployedSkill({
      remove: fakeRemove({
        global: ok("v1.2.0"),
        "/repo-a": ok("v0.9.0"),
      }),
    });

    const report = await bulk.execute({
      name: "tdd",
      targets: [{ target: global }, { target: repo("/repo-a") }],
    });

    expect(report.name).toBe("tdd");
    expect(report.removed).toEqual([
      { target: global, version: "v1.2.0" },
      { target: repo("/repo-a"), version: "v0.9.0" },
    ]);
    expect(report.refused).toEqual([]);
    expect(report.failed).toEqual([]);
  });

  it("walks the targets one at a time, in the order it was given them", async () => {
    const calls: Call[] = [];
    const bulk = new BulkRemoveDeployedSkill({
      remove: fakeRemove(
        { "/repo-a": ok("v1.0.0"), global: ok("v1.0.0") },
        calls,
      ),
    });

    await bulk.execute({
      name: "tdd",
      targets: [{ target: repo("/repo-a") }, { target: global }],
    });

    expect(calls.map((call) => call.key)).toEqual(["/repo-a", "global"]);
    expect(calls.map((call) => call.name)).toEqual(["tdd", "tdd"]);
  });

  it("keeps going after a typed failure and still reaches the rest of the batch", async () => {
    const calls: Call[] = [];
    const bulk = new BulkRemoveDeployedSkill({
      remove: fakeRemove(
        {
          "/repo-a": ok("v1.0.0"),
          "/repo-b": { ok: false, error: "remove-in-progress" },
          global: ok("v1.0.0"),
        },
        calls,
      ),
    });

    const report = await bulk.execute({
      name: "tdd",
      targets: [
        { target: repo("/repo-a") },
        { target: repo("/repo-b") },
        { target: global },
      ],
    });

    expect(calls.map((call) => call.key)).toEqual([
      "/repo-a",
      "/repo-b",
      "global",
    ]);
    expect(report.removed).toEqual([
      { target: repo("/repo-a"), version: "v1.0.0" },
      { target: global, version: "v1.0.0" },
    ]);
    expect(report.failed).toEqual([
      { target: repo("/repo-b"), reason: "remove-in-progress" },
    ]);
  });

  it("keeps going after an unexpected exception mid-batch", async () => {
    const calls: Call[] = [];
    const inner = fakeRemove({ "/repo-a": ok("v1.0.0"), global: ok("v1.0.0") });
    const bulk = new BulkRemoveDeployedSkill({
      remove: {
        async execute(input) {
          if (key(input.target) === "/repo-b") {
            // A real dependency (e.g. a filesystem read) can reject outside
            // RemoveDeployedSkill's own typed-error handling; the batch must
            // still reach the rest of the targets (#421).
            calls.push({ key: "/repo-b", name: input.name, token: undefined });
            throw new Error("ENOENT: filesystem read failed");
          }
          calls.push({
            key: key(input.target),
            name: input.name,
            token: input.confirmedReclaimToken,
          });
          return inner.execute(input);
        },
      },
    });

    const report = await bulk.execute({
      name: "tdd",
      targets: [
        { target: repo("/repo-a") },
        { target: repo("/repo-b") },
        { target: global },
      ],
    });

    expect(calls.map((call) => call.key)).toEqual([
      "/repo-a",
      "/repo-b",
      "global",
    ]);
    expect(report.removed).toEqual([
      { target: repo("/repo-a"), version: "v1.0.0" },
      { target: global, version: "v1.0.0" },
    ]);
    expect(report.failed).toEqual([
      { target: repo("/repo-b"), reason: "remove-failed" },
    ]);
  });

  it("skips a target the caller marked refused instead of attempting it", async () => {
    const calls: Call[] = [];
    const bulk = new BulkRemoveDeployedSkill({
      remove: fakeRemove({ "/repo-a": ok("v1.0.0") }, calls),
    });

    const report = await bulk.execute({
      name: "tdd",
      targets: [
        { target: repo("/repo-a") },
        { target: repo("/repo-b"), refused: "repo-not-registered" },
      ],
    });

    expect(calls.map((call) => call.key)).toEqual(["/repo-a"]);
    expect(report.refused).toEqual([
      { target: repo("/repo-b"), reason: "repo-not-registered" },
    ]);
    expect(report.removed).toEqual([
      { target: repo("/repo-a"), version: "v1.0.0" },
    ]);
    expect(report.failed).toEqual([]);
  });

  it("keeps every left-alone target on its own row with its own reason", async () => {
    const bulk = new BulkRemoveDeployedSkill({
      remove: fakeRemove({
        "/repo-a": { ok: false, error: "not-deployed" },
        "/repo-b": { ok: false, error: "remove-in-progress" },
      }),
    });

    const report = await bulk.execute({
      name: "tdd",
      targets: [
        { target: repo("/repo-a") },
        { target: repo("/repo-b") },
        { target: repo("/repo-c"), refused: "preflight-failed" },
      ],
    });

    expect(report.failed).toEqual([
      { target: repo("/repo-a"), reason: "not-deployed" },
      { target: repo("/repo-b"), reason: "remove-in-progress" },
    ]);
    expect(report.refused).toEqual([
      { target: repo("/repo-c"), reason: "preflight-failed" },
    ]);
  });

  it("carries what a failed target's disk probe found onto its own row", async () => {
    // A removal that reached apm and could not prove itself is not the same as
    // one that never got there: the probe's answer is the only thing that says
    // whether a copy is still on that target (#416, J04).
    const bulk = new BulkRemoveDeployedSkill({
      remove: fakeRemove({
        "/repo-a": {
          ok: false,
          error: "remove-failed",
          outcome: { scope: "repo", state: "unknown" },
        },
        "/repo-b": { ok: false, error: "repo-not-registered" },
      }),
    });

    const report = await bulk.execute({
      name: "tdd",
      targets: [{ target: repo("/repo-a") }, { target: repo("/repo-b") }],
    });

    expect(report.failed).toEqual([
      {
        target: repo("/repo-a"),
        reason: "remove-failed",
        outcome: { scope: "repo", state: "unknown" },
      },
      // Omitted, never null: a failure that never reached apm has no outcome,
      // and an absent key cannot be mistaken for one the server proved.
      { target: repo("/repo-b"), reason: "repo-not-registered" },
    ]);
  });

  it("passes each target's reclaim-consent token through to its own removal", async () => {
    const calls: Call[] = [];
    const token = "a".repeat(64);
    const bulk = new BulkRemoveDeployedSkill({
      remove: fakeRemove(
        { global: ok("v1.0.0"), "/repo-a": ok("v1.0.0") },
        calls,
      ),
    });

    await bulk.execute({
      name: "tdd",
      targets: [
        { target: global, confirmedReclaimToken: token },
        { target: repo("/repo-a") },
      ],
    });

    expect(calls).toEqual([
      { key: "global", name: "tdd", token },
      { key: "/repo-a", name: "tdd", token: undefined },
    ]);
  });

  // Each target was priced by its own preflight, so each carries its own proof;
  // one receipt can never speak for the target next to it (#458).
  it("passes each target's removal receipt through to its own removal", async () => {
    const calls: Call[] = [];
    const receipt = "b".repeat(64);
    const bulk = new BulkRemoveDeployedSkill({
      remove: fakeRemove(
        { global: ok("v1.0.0"), "/repo-a": ok("v1.0.0") },
        calls,
      ),
    });

    await bulk.execute({
      name: "tdd",
      targets: [
        { target: global, confirmedRemovalReceipt: receipt },
        { target: repo("/repo-a") },
      ],
    });

    expect(calls.map((call) => call.receipt)).toEqual([receipt, undefined]);
  });

  it("keeps an unproven target's refusal to its own row and finishes the batch", async () => {
    const bulk = new BulkRemoveDeployedSkill({
      remove: fakeRemove({
        "/repo-a": { ok: false, error: "cost-not-acknowledged" },
        "/repo-b": ok("v1.0.0"),
      }),
    });

    const report = await bulk.execute({
      name: "tdd",
      targets: [{ target: repo("/repo-a") }, { target: repo("/repo-b") }],
    });

    expect(report.failed).toEqual([
      { target: repo("/repo-a"), reason: "cost-not-acknowledged" },
    ]);
    expect(report.removed).toEqual([
      { target: repo("/repo-b"), version: "v1.0.0" },
    ]);
  });
});
