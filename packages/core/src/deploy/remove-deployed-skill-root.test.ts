// Removing from a target that follows one Harness release: one install at the
// same release while skills remain, and the named uninstall when the last one
// goes (ADR-0031, #951). The per-skill removal path a migrating target still
// uses is proven in `remove-deployed-skill.test.ts`.
import { describe, expect, it } from "vitest";
import type { DeployTarget } from "./deploy-skill";
import { InFlightLocks } from "./in-flight-locks";
import { RemoveDeployedSkill } from "./remove-deployed-skill";
import { selectionWorld } from "./selection-writer-fake";

const HARNESS = "fimoklei/agent-harness";
const ROOT = `github.com/${HARNESS}`;
const target: DeployTarget = { kind: "repo", repoPath: "/repo" };

function buildUseCase() {
  const world = selectionWorld();
  const deps = {
    registry: { isRegistered: async () => true },
    deployedRef: {
      resolve: async () => ({
        ok: false as const,
        reason: "not-deployed" as const,
      }),
    },
    deployedContent: {
      classify: async () => "clean" as const,
      contentDigest: async () => null,
    },
    apm: { removeSkill: async () => ({ ok: true as const }) },
    deployedCleanup: { removeSkillTargets: async () => {} },
    toolPresence: { detectGlobalTools: async () => ["claude" as const] },
    canonicalPath: async (path: string) => path,
    locks: new InFlightLocks(),
    location: { treeRoot: () => "/repo" },
    selection: world.writer,
    inventoryOrigin: async () => ({ host: "github.com", ownerRepo: HARNESS }),
  };
  return { world, remove: new RemoveDeployedSkill(deps), deps };
}

// The removal the cockpit sends, already carrying the consent its preflight
// minted, so these tests speak about the mechanism rather than the pricing.
async function removeConfirmed(
  useCase: RemoveDeployedSkill,
  name: string,
): Promise<Awaited<ReturnType<RemoveDeployedSkill["execute"]>>> {
  const request = { type: "skill", name, target };
  const priced = await useCase.execute(request);
  if (priced.ok || priced.error !== "cost-not-acknowledged") {
    return priced;
  }
  return await useCase.execute({
    ...request,
    confirmedRemovalReceipt: priced.receipt,
  });
}

describe("RemoveDeployedSkill on a target following one release", () => {
  it("narrows the selection with one install at the same release", async () => {
    const { world, remove } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["caveman", "prototype"] });

    const result = await removeConfirmed(remove, "caveman");

    expect(result).toEqual({
      ok: true,
      removed: {
        type: "skill",
        name: "caveman",
        version: "v0.6.0",
        scope: { kind: "repo" },
      },
    });
    expect(world.calls).toEqual([
      {
        command: "install",
        target,
        ref: `${ROOT}#v0.6.0`,
        skills: ["prototype"],
      },
    ]);
  });

  it("writes the removed skill's name out of the manifest", async () => {
    const { world, remove } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["caveman", "prototype"] });

    await removeConfirmed(remove, "caveman");

    expect(world.files.get("/target/apm.yml")).not.toContain("caveman");
    expect(world.files.get("/target/apm.yml")).toContain("prototype");
  });

  it("removes the last skill with the named uninstall of the Harness dependency", async () => {
    // An empty Selection has no expression: `skills: []` is refused outright,
    // so the last removal names the package instead (#957, apm-behavior.md).
    const { world, remove } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["prototype"] });

    const result = await removeConfirmed(remove, "prototype");

    expect(result).toMatchObject({ ok: true });
    expect(world.calls).toEqual([
      { command: "uninstall", target, ref: `${ROOT}#v0.6.0` },
    ]);
    expect(world.files.has("/target/apm.lock.yaml")).toBe(false);
  });

  it("reports the removal incomplete when the copy is still on disk", async () => {
    // A blocked uninstall exits after deleting the rest, while the manifest and
    // the lockfile still list every name (apm-behavior.md § Root package).
    const { world, remove } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["caveman", "prototype"] });
    world.landsOnly(["caveman", "prototype"]);

    const result = await removeConfirmed(remove, "caveman");

    expect(result).toMatchObject({ ok: false, error: "remove-incomplete" });
  });

  it("keeps the unfinished removal so a retry can converge on it", async () => {
    const { world, remove } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["caveman", "prototype"] });
    world.landsOnly(["caveman", "prototype"]);

    await removeConfirmed(remove, "caveman");

    expect(await world.operations.read("/repo")).toMatchObject({
      kind: "remove",
      release: "v0.6.0",
      previous: ["caveman", "prototype"],
      desired: ["prototype"],
    });
  });

  it("refuses a removal while an operation on the target is unfinished", async () => {
    const { world, remove } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["caveman", "prototype"] });
    world.landsOnly(["caveman", "prototype"]);
    await removeConfirmed(remove, "caveman");
    world.landsOnly(null);

    expect(await removeConfirmed(remove, "prototype")).toMatchObject({
      ok: false,
      error: "operation-unfinished",
    });
  });

  it("refuses before any write when the manifest names a shape it will not edit", async () => {
    const { world, remove } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["caveman", "prototype"] });
    world.files.set(
      "/target/apm.yml",
      `dependencies:\n  apm:\n    - ${ROOT}#v0.6.0\n`,
    );

    expect(await removeConfirmed(remove, "caveman")).toMatchObject({
      ok: false,
      error: "manifest-not-recognised",
    });
    expect(world.calls).toEqual([]);
  });

  it("refuses a skill the target's own record does not hold", async () => {
    const { world, remove } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["prototype"] });

    expect(await removeConfirmed(remove, "caveman")).toEqual({
      ok: false,
      error: "not-deployed",
    });
    expect(world.calls).toEqual([]);
  });
});
