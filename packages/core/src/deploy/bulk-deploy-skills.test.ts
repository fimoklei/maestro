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
  forceSeen?: (boolean | undefined)[],
): Pick<DeploySkill, "execute"> {
  return {
    async execute(input) {
      calls?.push(input.name);
      forceSeen?.push(input.force);
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
      { name: "review", error: "deployed-diverged-from-lock" },
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

  it("never forwards a batch-wide force to individual deploys", async () => {
    const forceSeen: (boolean | undefined)[] = [];
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy(
        {
          tdd: ok("tdd", "v1.2.0"),
          review: ok("review", "v0.9.0"),
        },
        undefined,
        forceSeen,
      ),
    });

    // A caller reaching past the type (e.g. a hand-built request body) must
    // still never smuggle a batch-wide force through to per-skill deploys —
    // force stays a deliberate, per-item decision (#292).
    await bulk.execute({
      names: ["tdd", "review"],
      target: { kind: "global" },
      force: true,
    } as unknown as BulkDeployInput);

    expect(forceSeen).toEqual([undefined, undefined]);
  });
});
