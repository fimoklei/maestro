import { describe, expect, it } from "vitest";
import { type BulkDeployInput, BulkDeploySkills } from "./bulk-deploy-skills";
import type { DeploySkill, DeploySkillError } from "./deploy-skill";

// A stand-in for DeploySkill.execute that answers from a scripted table keyed by
// skill name, and records the order it was called in. The real per-skill guards
// live in DeploySkill (tested there); a bulk run only orchestrates them.
type Scripted = Awaited<ReturnType<DeploySkill["execute"]>>;

function fakeDeploy(
  script: Record<string, Scripted>,
  calls?: string[],
  consentSeen?: (string | undefined)[],
): Pick<DeploySkill, "execute"> {
  return {
    async execute(input) {
      calls?.push(input.name);
      consentSeen?.push(input.confirmedCopyReceipt);
      const result = script[input.name];
      if (!result) {
        throw new Error(`no scripted result for ${input.name}`);
      }
      return result;
    },
  };
}

function ok(name: string, version: string): Scripted {
  return { ok: true, deployed: { type: "skill", name, version } };
}

function fail(error: DeploySkillError): Scripted {
  return { ok: false, error };
}

describe("BulkDeploySkills", () => {
  it("reports a target pinned per skill as attention, with no force to offer", async () => {
    // A bulk deploy never grants the reader's consent and never moves a
    // target's release, so this row is read, not forced (ADR-0031, #951).
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy({ tdd: fail("target-pinned-per-skill") }),
    });

    const report = await bulk.execute({
      names: ["tdd"],
      target: { kind: "global" },
    });

    expect(report.attention).toEqual([
      { name: "tdd", error: "target-pinned-per-skill", forceable: false },
    ]);
    expect(report.failed).toEqual([]);
  });

  it("reports a skill absent at the target's release as attention, never as a failure", async () => {
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy({ tdd: fail("not-at-target-release") }),
    });

    const report = await bulk.execute({
      names: ["tdd"],
      target: { kind: "global" },
    });

    expect(report.attention).toEqual([
      { name: "tdd", error: "not-at-target-release", forceable: false },
    ]);
  });

  // Story 51: a bulk run skips a target needing recovery, or one holding a
  // manifest Maestro will not edit, and states the reason (#956).
  it("reports an unfinished operation and an unrecognised manifest as attention", async () => {
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy({
        tdd: fail("operation-unfinished"),
        grill: fail("manifest-not-recognised"),
      }),
    });

    const report = await bulk.execute({
      names: ["tdd", "grill"],
      target: { kind: "global" },
    });

    expect(report.attention).toEqual([
      { name: "tdd", error: "operation-unfinished", forceable: false },
      { name: "grill", error: "manifest-not-recognised", forceable: false },
    ]);
    expect(report.deployed).toEqual([]);
    expect(report.failed).toEqual([]);
  });

  it("keeps a forceable refusal marked as one", async () => {
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy({ tdd: fail("deployed-diverged-from-lock") }),
    });

    const report = await bulk.execute({
      names: ["tdd"],
      target: { kind: "global" },
    });

    expect(report.attention).toEqual([
      { name: "tdd", error: "deployed-diverged-from-lock", forceable: true },
    ]);
  });

  it("counts an install that did not land as a failure, never as a success", async () => {
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy({ tdd: fail("deploy-incomplete") }),
    });

    const report = await bulk.execute({
      names: ["tdd"],
      target: { kind: "global" },
    });

    expect(report.deployed).toEqual([]);
    expect(report.failed).toEqual([
      { error: "deploy-incomplete", names: ["tdd"] },
    ]);
  });

  it("deploys every staged skill to the target and collects the successes", async () => {
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy({
        tdd: ok("tdd", "v1.2.0"),
        review: ok("review", "v0.9.0"),
      }),
    });

    const report = await bulk.execute({
      names: ["tdd", "review"],
      target: { kind: "global" },
    });

    expect(report.target).toEqual({ kind: "global" });
    expect(report.deployed).toEqual([
      { name: "tdd", version: "v1.2.0" },
      { name: "review", version: "v0.9.0" },
    ]);
    expect(report.attention).toEqual([]);
    expect(report.failed).toEqual([]);
  });

  it("keeps going after a failure and still attempts the rest of the batch", async () => {
    const calls: string[] = [];
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy(
        {
          tdd: ok("tdd", "v1.2.0"),
          review: fail("deploy-failed"),
          research: ok("research", "v0.3.0"),
        },
        calls,
      ),
    });

    const report = await bulk.execute({
      names: ["tdd", "review", "research"],
      target: { kind: "global" },
    });

    expect(calls).toEqual(["tdd", "review", "research"]);
    expect(report.deployed).toEqual([
      { name: "tdd", version: "v1.2.0" },
      { name: "research", version: "v0.3.0" },
    ]);
    expect(report.failed).toEqual([
      { error: "deploy-failed", names: ["review"] },
    ]);
  });

  it("marks a content-diverged skill as attention instead of failed", async () => {
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy({
        tdd: ok("tdd", "v1.2.0"),
        review: fail("deployed-diverged-from-lock"),
      }),
    });

    const report = await bulk.execute({
      names: ["tdd", "review"],
      target: { kind: "global" },
    });

    expect(report.deployed).toEqual([{ name: "tdd", version: "v1.2.0" }]);
    expect(report.attention).toEqual([
      { name: "review", error: "deployed-diverged-from-lock", forceable: true },
    ]);
    expect(report.failed).toEqual([]);
  });

  it("merges identical failures into one line carrying every affected skill", async () => {
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy({
        tdd: fail("auth-required"),
        review: fail("auth-required"),
        research: fail("no-published-tag"),
      }),
    });

    const report = await bulk.execute({
      names: ["tdd", "review", "research"],
      target: { kind: "repo", repoPath: "/repo" },
    });

    expect(report.failed).toEqual([
      { error: "auth-required", names: ["tdd", "review"] },
      { error: "no-published-tag", names: ["research"] },
    ]);
  });

  it("never forwards a batch-wide consent to individual deploys", async () => {
    const consentSeen: (string | undefined)[] = [];
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy(
        {
          tdd: ok("tdd", "v1.2.0"),
          review: ok("review", "v0.9.0"),
        },
        undefined,
        consentSeen,
      ),
    });

    // A caller reaching past the type (e.g. a hand-built request body) must
    // still never smuggle a batch-wide overwrite consent through to per-skill
    // deploys — it stays a deliberate, per-item decision (#292, #952).
    await bulk.execute({
      names: ["tdd", "review"],
      target: { kind: "global" },
      confirmedCopyReceipt: "a".repeat(64),
    } as unknown as BulkDeployInput);

    expect(consentSeen).toEqual([undefined, undefined]);
  });

  it("keeps going after an unexpected exception mid-batch", async () => {
    const calls: string[] = [];
    const inner = fakeDeploy(
      {
        tdd: ok("tdd", "v1.2.0"),
        research: ok("research", "v0.3.0"),
      },
      calls,
    );
    const bulk = new BulkDeploySkills({
      deploy: {
        async execute(input) {
          if (input.name === "review") {
            // A real dependency (e.g. a filesystem read) can reject outside
            // DeploySkill's own typed-error handling; the batch must still
            // reach the rest of the names (#292).
            calls.push(input.name);
            throw new Error("ENOENT: filesystem read failed");
          }
          return inner.execute(input);
        },
      },
    });

    const report = await bulk.execute({
      names: ["tdd", "review", "research"],
      target: { kind: "global" },
    });

    expect(calls).toEqual(["tdd", "review", "research"]);
    expect(report.deployed).toEqual([
      { name: "tdd", version: "v1.2.0" },
      { name: "research", version: "v0.3.0" },
    ]);
    expect(report.failed).toEqual([
      { error: "deploy-failed", names: ["review"] },
    ]);
  });
});
