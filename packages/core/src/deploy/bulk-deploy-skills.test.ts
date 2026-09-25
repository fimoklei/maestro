import { describe, expect, it } from "vitest";
import { type BulkDeployInput, BulkDeploySkills } from "./bulk-deploy-skills";
import type { DeploySkill, DeploySkillError } from "./deploy-skill";

// Stands in for DeploySkill.executeBatch; the guards and the install are tested there.
type Scripted = Awaited<ReturnType<DeploySkill["execute"]>>;

function fakeDeploy(
  script: Record<string, Scripted>,
  batches?: string[][],
): Pick<DeploySkill, "executeBatch"> {
  return {
    async executeBatch(input) {
      batches?.push([...input.names]);
      return input.names.map((name) => {
        const result = script[name];
        if (!result) {
          throw new Error(`no scripted result for ${name}`);
        }
        return { name, result };
      });
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
    // A bulk deploy never grants consent or moves a release, so this row is read,
    // not forced (#951).
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

  it("reports a busy target as attention, with no force to offer", async () => {
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy({ tdd: fail("deploy-in-progress") }),
    });

    const report = await bulk.execute({
      names: ["tdd"],
      target: { kind: "global" },
    });

    expect(report.attention).toEqual([
      { name: "tdd", error: "deploy-in-progress", forceable: false },
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

  it("hands every staged name to one batch and groups what it answered", async () => {
    const batches: string[][] = [];
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy(
        {
          tdd: ok("tdd", "v1.2.0"),
          review: fail("deploy-failed"),
          research: ok("research", "v0.3.0"),
        },
        batches,
      ),
    });

    const report = await bulk.execute({
      names: ["tdd", "review", "research"],
      target: { kind: "global" },
    });

    expect(batches).toEqual([["tdd", "review", "research"]]);
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

  it("keeps the link apm refused on its own failure line, one per skill", async () => {
    const bulk = new BulkDeploySkills({
      deploy: fakeDeploy({
        tdd: {
          ok: false,
          error: "destination-symlinked",
          linkedPath: "/home/.claude/skills/tdd",
        },
        grill: {
          ok: false,
          error: "destination-symlinked",
          linkedPath: "/home/.claude/skills/grill",
        },
      }),
    });

    const report = await bulk.execute({
      names: ["tdd", "grill"],
      target: { kind: "global" },
    });

    expect(report.failed).toEqual([
      {
        error: "destination-symlinked",
        names: ["tdd"],
        linkedPath: "/home/.claude/skills/tdd",
      },
      {
        error: "destination-symlinked",
        names: ["grill"],
        linkedPath: "/home/.claude/skills/grill",
      },
    ]);
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

  it("never forwards a batch-wide consent to the batch", async () => {
    let seen: unknown;
    const bulk = new BulkDeploySkills({
      deploy: {
        async executeBatch(input) {
          seen = input;
          return input.names.map((name) => ({ name, result: ok(name, "v1") }));
        },
      },
    });

    // A hand-built request body must still never smuggle a batch-wide overwrite
    // consent through (#292, #952).
    await bulk.execute({
      names: ["tdd", "review"],
      target: { kind: "global" },
      confirmedCopyReceipt: "a".repeat(64),
    } as unknown as BulkDeployInput);

    expect(seen).toEqual({
      names: ["tdd", "review"],
      target: { kind: "global" },
    });
  });

  it("fails every name when the batch throws, leaking nothing it said", async () => {
    const bulk = new BulkDeploySkills({
      deploy: {
        async executeBatch() {
          throw new Error("ENOENT: filesystem read failed");
        },
      },
    });

    const report = await bulk.execute({
      names: ["tdd", "review"],
      target: { kind: "global" },
    });

    expect(report.deployed).toEqual([]);
    expect(report.failed).toEqual([
      { error: "deploy-failed", names: ["tdd", "review"] },
    ]);
  });
});
