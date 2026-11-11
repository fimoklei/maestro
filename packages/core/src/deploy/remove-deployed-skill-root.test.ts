import { describe, expect, it } from "vitest";
import type { DeployTarget } from "./deploy-skill";
import { type CopyStates, copiesIn } from "./deployed-content.fake";
import { DEFAULT_GLOBAL_LAYOUT } from "./global-layout.fake";
import { InFlightLocks } from "./in-flight-locks";
import { RemoveDeployedSkill } from "./remove-deployed-skill";
import { selectionWorld } from "./selection-writer-fake";

const HARNESS = "fimoklei/agent-harness";
const ROOT = `github.com/${HARNESS}`;
const target: DeployTarget = { kind: "repo", repoPath: "/repo" };

function buildUseCase(copy: CopyStates = "clean") {
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
      ...copiesIn(copy).content,
    },
    apm: { removeSkill: async () => ({ ok: true as const }) },
    globalLayout: () => DEFAULT_GLOBAL_LAYOUT,
    toolPresence: { detectGlobalTools: async () => ["claude" as const] },
    canonicalPath: async (path: string) => path,
    locks: new InFlightLocks(),
    selection: world.writer,
    harnessOrigin: async () => ({ host: "github.com", ownerRepo: HARNESS }),
  };
  return { world, remove: new RemoveDeployedSkill(deps), deps };
}

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
    // `skills: []` is refused, so the last removal names the package instead (#957).
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
    // lockfile still list every name.
    const { world, remove } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["caveman", "prototype"] });
    world.landsOnly(["caveman", "prototype"]);

    const result = await removeConfirmed(remove, "caveman");

    expect(result).toMatchObject({ ok: false, error: "remove-incomplete" });
  });

  it("reports a timed-out narrowing install as a timed-out removal", async () => {
    const { world, remove } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["caveman", "prototype"] });
    world.refuseWith({ ok: false, reason: "timed-out" });

    const result = await removeConfirmed(remove, "caveman");

    expect(result).toMatchObject({ ok: false, error: "remove-timed-out" });
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

  it("narrows the selection when the removal runs as part of a batch", async () => {
    const { world, remove } = buildUseCase();
    world.seed({ release: "v0.6.0", skills: ["caveman", "prototype"] });
    const preflight = await remove.preflight({
      type: "skill",
      name: "caveman",
      target,
    });

    const report = await remove.executeBatch({
      name: "caveman",
      targets: [
        {
          target,
          confirmedRemovalReceipt: preflight.ok ? preflight.receipt : undefined,
        },
      ],
    });

    expect(report.removed).toEqual([{ target, version: "v0.6.0" }]);
    expect(world.files.get("/target/apm.yml")).not.toContain("caveman");
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

describe("RemoveDeployedSkill refusing a copy with local edits", () => {
  const request = { type: "skill", name: "tdd", target };

  it.each<DeployTarget>([target, { kind: "global" }])(
    "names the pinned-per-skill refusal on a target still pinned per skill (%o)",
    async (pinned) => {
      const request = { type: "skill", name: "tdd", target: pinned };
      const { world, deps } = buildUseCase("diverged");
      const remove = new RemoveDeployedSkill({
        ...deps,
        deployedRef: {
          resolve: async () => ({
            ok: true as const,
            ref: `${ROOT}/.apm/skills/tdd#v0.4.0`,
            version: "v0.4.0",
          }),
        },
      });
      world.files.set(
        "/target/apm.lock.yaml",
        `dependencies:
- repo_url: ${HARNESS}
  host: github.com
  resolved_ref: v0.4.0
  virtual_path: .apm/skills/tdd
  package_type: claude_skill
`,
      );

      const refusal = {
        ok: false,
        error: "deployed-diverged-pinned-per-skill",
        ...(pinned.kind === "global"
          ? {
              folders: ["~/.claude/skills", "~/.agents/skills"],
              notWritten: ["~/.agents/skills"],
            }
          : {}),
      };
      expect(await remove.preflight(request)).toEqual(refusal);
      expect(await remove.execute(request)).toEqual(refusal);
      expect(world.calls).toEqual([]);
    },
  );

  it("keeps the Deploy again refusal on a target following one release", async () => {
    const { world, remove } = buildUseCase("diverged");
    world.seed({ release: "v0.6.0", skills: ["tdd"] });

    const refusal = { ok: false, error: "deployed-diverged-from-lock" };
    expect(await remove.preflight(request)).toEqual(refusal);
    expect(await remove.execute(request)).toEqual(refusal);
    expect(world.calls).toEqual([]);
  });
});

// Only Claude Code is detected, so Global writes its folder and leaves the
// Codex folder alone, except when apm's named uninstall reaches it.
describe("RemoveDeployedSkill on Global with an undetected tool's folder", () => {
  const global: DeployTarget = { kind: "global" };
  const removeFromGlobal = (name: string) => ({
    type: "skill",
    name,
    target: global,
  });
  const claudeFolder = {
    tool: "claude",
    path: "~/.claude/skills",
    detected: true,
    warning: null,
  };

  it("removes a skill that leaves others, whatever the undetected folder holds", async () => {
    const { world, remove } = buildUseCase({ codex: "diverged" });
    world.seed({ release: "v0.6.0", skills: ["caveman", "prototype"] });

    expect(await remove.preflight(removeFromGlobal("caveman"))).toEqual({
      ok: true,
      check: { scope: "global", tools: [claudeFolder] },
      receipt: expect.any(String),
    });
    expect(await removeConfirmedFrom(remove, global, "caveman")).toMatchObject({
      ok: true,
    });
  });

  it("refuses to remove the last skill over local edits in the undetected folder, naming it", async () => {
    const { world, remove } = buildUseCase({ codex: "diverged" });
    world.seed({ release: "v0.6.0", skills: ["prototype"] });

    // No deploy writes the undetected folder, so none can restore its copy.
    const refusal = {
      ok: false,
      error: "deployed-diverged-from-lock",
      folders: ["~/.agents/skills"],
      notWritten: ["~/.agents/skills"],
    };
    expect(await remove.preflight(removeFromGlobal("prototype"))).toEqual(
      refusal,
    );
    expect(await remove.execute(removeFromGlobal("prototype"))).toEqual(
      refusal,
    );
    expect(world.calls).toEqual([]);
  });

  it("lists the undetected folder that holds a copy when the last skill goes", async () => {
    const { world, remove } = buildUseCase({ codex: "clean" });
    world.seed({ release: "v0.6.0", skills: ["prototype"] });

    expect(await remove.preflight(removeFromGlobal("prototype"))).toEqual({
      ok: true,
      check: {
        scope: "global",
        tools: [
          claudeFolder,
          {
            tool: "codex",
            path: "~/.agents/skills",
            detected: false,
            warning: null,
          },
        ],
      },
      receipt: expect.any(String),
    });
  });

  it("leaves out an undetected folder that holds no copy", async () => {
    const { world, remove } = buildUseCase({ codex: "not-deployed" });
    world.seed({ release: "v0.6.0", skills: ["prototype"] });

    expect(await remove.preflight(removeFromGlobal("prototype"))).toEqual({
      ok: true,
      check: { scope: "global", tools: [claudeFolder] },
      receipt: expect.any(String),
    });
  });

  it("names the detected folder whose copy refuses the removal", async () => {
    const { world, remove } = buildUseCase({ claude: "diverged" });
    world.seed({ release: "v0.6.0", skills: ["caveman", "prototype"] });

    expect(await remove.preflight(removeFromGlobal("caveman"))).toEqual({
      ok: false,
      error: "deployed-diverged-from-lock",
      folders: ["~/.claude/skills"],
    });
  });
});

async function removeConfirmedFrom(
  useCase: RemoveDeployedSkill,
  on: DeployTarget,
  name: string,
) {
  const request = { type: "skill", name, target: on };
  const preflight = await useCase.preflight(request);
  return useCase.execute({
    ...request,
    confirmedRemovalReceipt: preflight.ok ? preflight.receipt : undefined,
  });
}
