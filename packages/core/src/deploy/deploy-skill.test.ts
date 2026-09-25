import { describe, expect, it } from "vitest";
import {
  type DeployedContentPort,
  type DeployedContentState,
  DeploySkill,
  type DeployTarget,
  type RecordedPackageResult,
} from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import { InFlightLocks } from "./in-flight-locks";
import { LocalCopyGuard } from "./local-copy-guard";
import { selectionWorld } from "./selection-writer-fake";

const repo = (repoPath: string): DeployTarget => ({ kind: "repo", repoPath });
const globalTarget: DeployTarget = { kind: "global" };

const contentState = (state: DeployedContentState): DeployedContentPort => ({
  classify: async () => state,
  contentDigest: async () => null,
  linkedSkillPath: async () => null,
});

// `deployedContent` is the whole port: the guard reads its `classify`, the
// use-case only asks it for a linked destination.
const buildDeps = (
  overrides?: Partial<
    Omit<ConstructorParameters<typeof DeploySkill>[0], "deployedContent">
  > & { deployedContent?: DeployedContentPort },
) => {
  const world = selectionWorld();
  const deployed = world.calls;
  const classified: Array<{
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }> = [];
  const cleaned: Array<{
    target: DeployTarget;
    name: string;
    tools: readonly SupportedTool[];
  }> = [];
  const base = {
    inventory: {
      read: async () => ({
        ok: true as const,
        primitives: [
          {
            type: "skill" as const,
            name: "tdd",
            description: "Test-driven development",
          },
        ],
      }),
    },
    registry: {
      isRegistered: async (path: string) => path === "/registered/repo",
    },
    apm: {
      resolveLatestTag: async (_ownerRepo: string) => ({
        ok: true as const,
        tag: "v0.5.1",
      }),
      // Never reached: the install runs inside the Selection writer (#951).
      deploySkill: async () => ({ ok: true as const }),
    },
    inventoryOriginUrl: async () => "git@github.com:fimoklei/agent-harness.git",
    inventoryGit: {
      syncBeforeDeploy: async () => {},
      skillExistsAtTag: async (_tag: string, _name: string) => true,
      skillDivergesFromTag: async (_tag: string, _name: string) => false,
      readSkillFilesAtTag: async (_tag: string, _name: string) => null,
    },
    deployedContent: {
      classify: async (input: {
        target: DeployTarget;
        name: string;
        tools?: readonly SupportedTool[];
      }) => {
        classified.push(input);
        return "not-deployed" as const;
      },
      contentDigest: async () => null,
      linkedSkillPath: async () => null,
    },
    deployedCleanup: {
      removeSkillTargets: async (input: {
        target: DeployTarget;
        name: string;
        tools: readonly SupportedTool[];
      }) => {
        cleaned.push(input);
      },
    },
    toolPresence: {
      detectGlobalTools: async (): Promise<SupportedTool[]> => [
        "claude",
        "codex",
      ],
    },
    recordedPackage: {
      read: async (_input: { target: DeployTarget; name: string }) =>
        ({
          kind: "recorded",
          reading: { kind: "skill", name: "tdd" },
        }) as RecordedPackageResult,
    },
    canonicalPath: async (path: string) => path,
    locks: new InFlightLocks(),
    selection: world.writer,
    ...overrides,
  };
  const copyGuard = new LocalCopyGuard({ content: base.deployedContent });
  const deps = { ...base, copyGuard };
  return { deps, deployed, classified, cleaned, copyGuard, world };
};

describe("DeploySkill", () => {
  it("refuses to call an install that placed nothing a clean deploy", async () => {
    // apm prints its success marker whatever landed (#358, #951).
    const { deps, cleaned, world } = buildDeps();
    world.landsOnly([]);

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "deploy-incomplete" });
    expect(cleaned).toEqual([]);
  });

  it("refuses a global install that landed only part of the selection", async () => {
    const { deps, world } = buildDeps();
    world.seed({ release: "v0.5.1", skills: ["review"] });
    world.landsOnly(["review"]);

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result).toEqual({ ok: false, error: "deploy-incomplete" });
  });

  it("keeps the unfinished operation so a retry can converge on it", async () => {
    const { deps, world } = buildDeps();
    world.landsOnly([]);

    await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(await world.operations.read("/registered/repo")).toMatchObject({
      kind: "deploy",
      release: "v0.5.1",
      desired: ["tdd"],
    });
  });

  it("refuses a second operation while one is unfinished", async () => {
    const { deps, world } = buildDeps();
    world.landsOnly([]);
    const deploy = new DeploySkill(deps);
    const request = {
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    };

    await deploy.execute(request);
    world.landsOnly(null);

    expect(await deploy.execute(request)).toEqual({
      ok: false,
      error: "operation-unfinished",
    });
  });

  it("deploys a corrected release over a copy apm itself left unverifiable", async () => {
    // Without a baseline the guard would refuse this copy as unverifiable, but it
    // is apm's own, not local work (#358).
    const { deps } = buildDeps({
      deployedContent: {
        classify: async () => "unverifiable" as const,
        contentDigest: async () => null,
        linkedSkillPath: async () => null,
      },
      recordedPackage: {
        read: async () => ({
          kind: "recorded" as const,
          reading: { kind: "unsupported" as const, packageType: "hybrid" },
        }),
      },
    });

    expect(
      await new DeploySkill(deps).execute({
        type: "skill",
        name: "tdd",
        target: repo("/registered/repo"),
      }),
    ).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
  });

  it("installs nothing when the target's deployment record cannot be read", async () => {
    const { deps, deployed, world } = buildDeps();
    world.files.set("/target/apm.lock.yaml", "dependencies: [\n");

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "lockfile-malformed" });
    expect(deployed).toEqual([]);
  });

  it("deploys a known skill to a registered repo at the latest tag", async () => {
    const { deps, deployed } = buildDeps();
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    // The repository root with the whole Selection, never a per-skill subpath ref.
    expect(deployed).toEqual([
      {
        command: "install",
        target: repo("/registered/repo"),
        ref: "github.com/fimoklei/agent-harness#v0.5.1",
        skills: ["tdd"],
      },
    ]);
  });

  it("adds a skill to the selection at the release the target already follows", async () => {
    const { deps, deployed, world } = buildDeps();
    world.seed({ release: "v0.4.0", skills: ["review"] });

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.4.0" },
    });
    expect(deployed).toEqual([
      {
        command: "install",
        target: repo("/registered/repo"),
        ref: "github.com/fimoklei/agent-harness#v0.4.0",
        skills: ["review", "tdd"],
      },
    ]);
  });

  it("refuses a deploy on a target still pinned per skill", async () => {
    const { deps, deployed, world } = buildDeps();
    world.files.set(
      "/target/apm.lock.yaml",
      `dependencies:
- repo_url: fimoklei/agent-harness
  host: github.com
  resolved_ref: v0.4.0
  virtual_path: .apm/skills/review
  package_type: claude_skill
`,
    );

    expect(
      await new DeploySkill(deps).execute({
        type: "skill",
        name: "tdd",
        target: repo("/registered/repo"),
      }),
    ).toEqual({ ok: false, error: "target-pinned-per-skill" });
    expect(deployed).toEqual([]);
  });

  it("refuses before any write when the manifest names a shape it will not edit", async () => {
    const { deps, deployed, world } = buildDeps();
    world.seed({ release: "v0.4.0", skills: ["review"] });
    world.files.set(
      "/target/apm.yml",
      "dependencies:\n  apm:\n    - github.com/fimoklei/agent-harness#v0.4.0\n",
    );

    expect(
      await new DeploySkill(deps).execute({
        type: "skill",
        name: "tdd",
        target: repo("/registered/repo"),
      }),
    ).toEqual({ ok: false, error: "manifest-not-recognised" });
    expect(deployed).toEqual([]);
  });

  it("refuses when the skill is not in the release the target follows", async () => {
    const { deps, deployed, world } = buildDeps({
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async (tag: string) => tag !== "v0.4.0",
        skillDivergesFromTag: async () => false,
        readSkillFilesAtTag: async () => null,
      },
    });
    world.seed({ release: "v0.4.0", skills: ["review"] });

    expect(
      await new DeploySkill(deps).execute({
        type: "skill",
        name: "tdd",
        target: repo("/registered/repo"),
      }),
    ).toEqual({ ok: false, error: "not-at-target-release" });
    expect(deployed).toEqual([]);
  });

  it("deploys a known skill globally at the latest tag", async () => {
    const { deps, deployed } = buildDeps();
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(deployed).toEqual([
      {
        command: "install",
        target: globalTarget,
        ref: "github.com/fimoklei/agent-harness#v0.5.1",
        skills: ["tdd"],
        tools: ["claude", "codex"],
      },
    ]);
  });

  it("targets only the detected tool on a single-tool machine", async () => {
    // Anything wider makes apm write a copy for a tool the user lacks (#131).
    const { deps, deployed } = buildDeps({
      toolPresence: { detectGlobalTools: async () => ["claude"] },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result.ok).toBe(true);
    expect(deployed).toEqual([
      {
        command: "install",
        target: globalTarget,
        ref: "github.com/fimoklei/agent-harness#v0.5.1",
        skills: ["tdd"],
        tools: ["claude"],
      },
    ]);
  });

  it("scopes the destination guard to the detected tools on a global deploy", async () => {
    // A leftover .agents copy from a two-tool install must not force a false
    // refusal (#136).
    const { deps, classified } = buildDeps({
      toolPresence: { detectGlobalTools: async () => ["claude"] },
    });
    await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(classified).toEqual([
      {
        target: globalTarget,
        name: "tdd",
        tools: ["claude"],
        release: "v0.5.1",
      },
    ]);
  });

  it("passes no tool scope to the guard for a repo deploy", async () => {
    const { deps, classified } = buildDeps();
    await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    // The release about to install, so a copy already equal to it is not read as
    // local edits (#952).
    expect(classified).toEqual([
      {
        target: repo("/registered/repo"),
        name: "tdd",
        tools: undefined,
        release: "v0.5.1",
      },
    ]);
  });

  it("removes the untargeted tool's copy when that tool owns its directory", async () => {
    // Only Claude Code reads the Claude skills folder, so its absence proves that
    // copy dead (#136).
    const { deps, cleaned, deployed } = buildDeps({
      toolPresence: { detectGlobalTools: async () => ["codex"] },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result.ok).toBe(true);
    expect(deployed).toHaveLength(1);
    expect(cleaned).toEqual([
      { target: globalTarget, name: "tdd", tools: ["claude"] },
    ]);
  });

  it("keeps the untargeted tool's copy when other tools read its directory", async () => {
    // Cursor, Copilot, Gemini and others read .agents/skills/ too, so Maestro cannot
    // prove it dead (#202).
    const { deps, cleaned, deployed } = buildDeps({
      toolPresence: { detectGlobalTools: async () => ["claude"] },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result.ok).toBe(true);
    expect(deployed).toHaveLength(1);
    expect(cleaned).toEqual([]);
  });

  it("cleans nothing when the global deploy targets every tool", async () => {
    const { deps, cleaned } = buildDeps();
    await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(cleaned).toEqual([]);
  });

  it("never cleans on a repo deploy", async () => {
    const { deps, cleaned } = buildDeps();
    await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(cleaned).toEqual([]);
  });

  it("does not clean when the global install fails", async () => {
    // Codex-only, so a successful install here would have cleaned the Claude copy.
    const { deps, cleaned, world } = buildDeps({
      toolPresence: { detectGlobalTools: async () => ["codex"] },
    });
    world.refuseWith({ ok: false, reason: "failed" });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result).toEqual({ ok: false, error: "deploy-failed" });
    expect(cleaned).toEqual([]);
  });

  it("still reports success when the obsolete-copy cleanup fails", async () => {
    const { deps, deployed } = buildDeps({
      toolPresence: { detectGlobalTools: async () => ["codex"] },
      deployedCleanup: {
        removeSkillTargets: async () => {
          throw new Error("fs error removing the obsolete copy");
        },
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(deployed).toHaveLength(1);
  });

  it("refuses a global deploy when no supported tool is detected, before apm", async () => {
    // Both apm methods throw, proving apm is never invoked (#131).
    const { deps, deployed } = buildDeps({
      toolPresence: { detectGlobalTools: async () => [] },
      apm: {
        resolveLatestTag: async () => {
          throw new Error("apm must not run when no tool is detected");
        },
        deploySkill: async () => {
          throw new Error("apm must not run when no tool is detected");
        },
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result).toEqual({ ok: false, error: "no-supported-tool" });
    expect(deployed).toEqual([]);
  });

  it("never consults tool presence for a repo deploy", async () => {
    const { deps, deployed } = buildDeps({
      toolPresence: {
        detectGlobalTools: async () => {
          throw new Error("presence must not be probed for a repo deploy");
        },
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result.ok).toBe(true);
    expect(deployed).toEqual([
      {
        command: "install",
        target: repo("/registered/repo"),
        ref: "github.com/fimoklei/agent-harness#v0.5.1",
        skills: ["tdd"],
      },
    ]);
  });

  it("deploys globally without consulting the registry", async () => {
    const { deps, deployed } = buildDeps({
      registry: {
        isRegistered: async () => {
          throw new Error("registry must not be consulted for a global deploy");
        },
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(deployed).toHaveLength(1);
  });

  it("rejects a non-skill primitive type, before touching any port", async () => {
    // The edge accepts any string, so the skill-only rule lives in core (#15).
    const { deps, deployed } = buildDeps();
    const result = await new DeploySkill(deps).execute({
      type: "hook",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "unsupported-primitive-type" });
    expect(deployed).toEqual([]);
  });

  it("rejects a name that is not a strict slug, before touching any port", async () => {
    const { deps, deployed } = buildDeps();
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "; rm -rf ~",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "invalid-name" });
    expect(deployed).toEqual([]);
  });

  it("rejects a skill that is not in the inventory", async () => {
    const { deps, deployed } = buildDeps();
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "unknown-skill",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "unknown-skill" });
    expect(deployed).toEqual([]);
  });

  it("deploys one named skill out of an inventory that holds several", async () => {
    const { deps, deployed } = buildDeps({
      inventory: {
        read: async () => ({
          ok: true as const,
          primitives: [
            { type: "skill" as const, name: "jobs", description: "The board" },
            {
              type: "skill" as const,
              name: "tdd",
              description: "Test-driven development",
            },
          ],
        }),
      },
    });

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(deployed).toHaveLength(1);
  });

  it("reports an unconfigured inventory instead of guessing", async () => {
    const { deps } = buildDeps({
      inventory: {
        read: async () => ({
          ok: false as const,
          error: "not-configured" as const,
        }),
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "inventory-not-configured" });
  });

  // Calling it "not configured" would send the author to re-connect a live harness.
  it("reports an unreadable inventory apart from an unconfigured one", async () => {
    const { deps } = buildDeps({
      inventory: {
        read: async () => ({
          ok: false as const,
          error: "unreadable" as const,
        }),
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "inventory-unreadable" });
  });

  it("rejects a repo that is not in the registry", async () => {
    const { deps, deployed } = buildDeps();
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/somewhere/else"),
    });

    expect(result).toEqual({ ok: false, error: "repo-not-registered" });
    expect(deployed).toEqual([]);
  });

  it("gates on registry membership before reading the inventory", async () => {
    const { deps } = buildDeps({
      inventory: {
        read: async () => {
          throw new Error(
            "inventory must not be read for an unregistered repo",
          );
        },
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/somewhere/else"),
    });

    expect(result).toEqual({ ok: false, error: "repo-not-registered" });
  });

  it("reports an unavailable or unparseable inventory origin", async () => {
    const { deps } = buildDeps({ inventoryOriginUrl: async () => null });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({
      ok: false,
      error: "inventory-origin-unavailable",
    });
  });

  it("reports no-published-tag when the inventory has no tag at all", async () => {
    const { deps, deployed } = buildDeps({
      apm: {
        resolveLatestTag: async () => ({ ok: false, reason: "no-tag" }),
        deploySkill: async () => {
          throw new Error("must not deploy without a tag");
        },
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "no-published-tag" });
    expect(deployed).toEqual([]);
  });

  it("reports auth-required when apm cannot authenticate to GitHub", async () => {
    const { deps, deployed } = buildDeps({
      apm: {
        resolveLatestTag: async () => ({ ok: false, reason: "auth-required" }),
        deploySkill: async () => {
          throw new Error("must not deploy without an authenticated resolve");
        },
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "auth-required" });
    expect(deployed).toEqual([]);
  });

  it("reports destination-symlinked, with no path when no destination is a link", async () => {
    // A link that vanished before the probe leaves no path, never a guessed one (#748).
    const { deps, world } = buildDeps();
    world.refuseWith({ ok: false, reason: "destination-symlinked" });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "destination-symlinked" });
  });

  it("names the link apm refused, so the notice can spell out one rm", async () => {
    const { deps, world } = buildDeps({
      deployedContent: {
        classify: async () => "not-deployed" as const,
        contentDigest: async () => null,
        linkedSkillPath: async () => "/registered/repo/.claude/skills/tdd",
      },
    });
    world.refuseWith({ ok: false, reason: "destination-symlinked" });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({
      ok: false,
      error: "destination-symlinked",
      linkedPath: "/registered/repo/.claude/skills/tdd",
    });
  });

  it("reports deploy-failed for an unclassified install failure", async () => {
    const { deps, world } = buildDeps();
    world.refuseWith({ ok: false, reason: "failed" });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "deploy-failed" });
  });

  it("falls back to deploy-failed for a generic resolve failure", async () => {
    const { deps, deployed } = buildDeps({
      apm: {
        resolveLatestTag: async () => ({ ok: false, reason: "failed" }),
        deploySkill: async () => {
          throw new Error("must not deploy after a failed resolve");
        },
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "deploy-failed" });
    expect(deployed).toEqual([]);
  });

  it("reports no-published-tag when the latest tag does not contain the skill", async () => {
    // apm view is repo-level: a tag existing says nothing about it containing the
    // skill (#15).
    const { deps, deployed } = buildDeps({
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => false,
        skillDivergesFromTag: async () => false,
        readSkillFilesAtTag: async () => null,
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "no-published-tag" });
    expect(deployed).toEqual([]);
  });

  it("refuses to deploy a skill whose local tree diverges from the tag", async () => {
    const { deps, deployed } = buildDeps({
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => true,
        readSkillFilesAtTag: async () => null,
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({
      ok: false,
      error: "local-diverged-from-tag",
    });
    expect(deployed).toEqual([]);
  });

  it("refuses a global deploy when the local tree diverges from the tag", async () => {
    const { deps, deployed } = buildDeps({
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => true,
        readSkillFilesAtTag: async () => null,
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result).toEqual({ ok: false, error: "local-diverged-from-tag" });
    expect(deployed).toEqual([]);
  });

  it("refuses to deploy when the deployed copy diverges from the lockfile", async () => {
    // A same-ref apm install silently resets a locally edited deployed copy (#56).
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("diverged"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toMatchObject({
      ok: false,
      error: "deployed-diverged-from-lock",
    });
    expect(deployed).toEqual([]);
  });

  it("refuses when the deployed copy cannot be verified (legacy lockfile)", async () => {
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("unverifiable"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toMatchObject({
      ok: false,
      error: "deployed-unverifiable",
    });
    expect(deployed).toEqual([]);
  });

  it("refuses when the deployed copy cannot be read", async () => {
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("unreadable"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "deployed-unreadable" });
    expect(deployed).toEqual([]);
  });

  it("refuses when the target lockfile cannot be parsed", async () => {
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("lockfile-malformed"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "lockfile-malformed" });
    expect(deployed).toEqual([]);
  });

  it("offers no consent past a malformed lockfile", async () => {
    // The refusal mints no receipt, and a made-up one clears nothing (#58, #952).
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("lockfile-malformed"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
      confirmedCopyReceipt: "a".repeat(64),
    });

    expect(result).toEqual({ ok: false, error: "lockfile-malformed" });
    expect(deployed).toEqual([]);
  });

  it("deploys when the deployed copy is clean (an unedited re-deploy)", async () => {
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("clean"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result.ok).toBe(true);
    expect(deployed).toHaveLength(1);
  });

  it("refuses a global deploy when the deployed copy diverges", async () => {
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("diverged"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result).toMatchObject({
      ok: false,
      error: "deployed-diverged-from-lock",
    });
    expect(deployed).toEqual([]);
  });

  it("deploys past a locally edited copy once its own receipt comes back", async () => {
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("diverged"),
    });
    const refusal = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });
    if (refusal.ok) {
      throw new Error("expected the edited copy to be refused");
    }
    expect(refusal.error).toBe("deployed-diverged-from-lock");
    expect(refusal.copyReceipt).toMatch(/^[0-9a-f]{64}$/);

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
      confirmedCopyReceipt: refusal.copyReceipt,
    });

    expect(result).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(deployed).toHaveLength(1);
  });

  it("deploys past an unverified copy once its own receipt comes back", async () => {
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("unverifiable"),
    });
    const refusal = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });
    if (refusal.ok) {
      throw new Error("expected the unverified copy to be refused");
    }
    expect(refusal.error).toBe("deployed-unverifiable");

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
      confirmedCopyReceipt: refusal.copyReceipt,
    });

    expect(result.ok).toBe(true);
    expect(deployed).toHaveLength(1);
  });

  it("refuses a receipt minted for another skill on the same target", async () => {
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("diverged"),
      inventory: {
        read: async () => ({
          ok: true as const,
          primitives: [
            { type: "skill" as const, name: "tdd", description: "One" },
            { type: "skill" as const, name: "grill", description: "Two" },
          ],
        }),
      },
    });
    const other = await new DeploySkill(deps).execute({
      type: "skill",
      name: "grill",
      target: repo("/registered/repo"),
    });
    if (other.ok) {
      throw new Error("expected the edited copy to be refused");
    }

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
      confirmedCopyReceipt: other.copyReceipt,
    });

    expect(result).toMatchObject({
      ok: false,
      error: "deployed-diverged-from-lock",
    });
    expect(deployed).toEqual([]);
  });

  it("consents to the copy only — source divergence still refuses", async () => {
    const { deps, deployed } = buildDeps({
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => true,
        readSkillFilesAtTag: async () => null,
      },
      deployedContent: contentState("diverged"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
      confirmedCopyReceipt: "a".repeat(64),
    });

    expect(result).toEqual({ ok: false, error: "local-diverged-from-tag" });
    expect(deployed).toEqual([]);
  });

  it("offers no consent past an unreadable deployed copy", async () => {
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("unreadable"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
      confirmedCopyReceipt: "a".repeat(64),
    });

    expect(result).toEqual({ ok: false, error: "deployed-unreadable" });
    expect(deployed).toEqual([]);
  });

  it("rejects a concurrent deploy to the same repo while one is in progress", async () => {
    // The lock keys on the canonical path, so a symlinked spelling of the repo
    // cannot race the same lockfile (#15).
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { deps } = buildDeps({
      apm: {
        resolveLatestTag: async () => ({ ok: true, tag: "v0.5.1" }),
        deploySkill: async () => {
          await gate;
          return { ok: true as const };
        },
      },
      canonicalPath: async (_path: string) => "/canonical/repo",
    });
    const useCase = new DeploySkill(deps);

    const first = useCase.execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });
    const second = await useCase.execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(second).toEqual({ ok: false, error: "deploy-in-progress" });

    release();
    await expect(first).resolves.toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
  });

  it("rejects a concurrent global deploy while one is in progress", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { deps } = buildDeps({
      apm: {
        resolveLatestTag: async () => ({ ok: true, tag: "v0.5.1" }),
        deploySkill: async () => {
          await gate;
          return { ok: true as const };
        },
      },
    });
    const useCase = new DeploySkill(deps);

    const first = useCase.execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });
    const second = await useCase.execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(second).toEqual({ ok: false, error: "deploy-in-progress" });

    release();
    await expect(first).resolves.toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
  });

  it("releases the deploy lock after a finished deploy, even a failed one", async () => {
    const { deps, world } = buildDeps();
    world.refuseWith({ ok: false, reason: "failed" });
    const useCase = new DeploySkill(deps);
    const input = {
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    };

    await expect(useCase.execute(input)).resolves.toEqual({
      ok: false,
      error: "deploy-failed",
    });
    // Refused for what the first attempt left behind, not for a lock never released.
    await expect(useCase.execute(input)).resolves.toEqual({
      ok: false,
      error: "operation-unfinished",
    });
  });

  it("turns an apm install failure into a typed deploy-failed error", async () => {
    const { deps, world } = buildDeps();
    world.refuseWith("throw");
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "deploy-failed" });
  });

  it("turns an apm tag-resolution failure into a typed deploy-failed error", async () => {
    const { deps, deployed } = buildDeps({
      apm: {
        resolveLatestTag: async () => {
          throw new Error("apm view failed: no network");
        },
        deploySkill: async () => ({ ok: true as const }),
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "deploy-failed" });
    expect(deployed).toEqual([]);
  });
});

describe("DeploySkill.executeBatch", () => {
  const skills = (...names: string[]) => ({
    read: async () => ({
      ok: true as const,
      primitives: names.map((name) => ({
        type: "skill" as const,
        name,
        description: name,
      })),
    }),
  });

  it("deploys every staged name in one install", async () => {
    const { deps, deployed } = buildDeps({
      inventory: skills("tdd", "review", "docs"),
    });

    const results = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review", "docs"],
      target: repo("/registered/repo"),
    });

    expect(results).toEqual([
      {
        name: "tdd",
        result: {
          ok: true,
          deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
        },
      },
      {
        name: "review",
        result: {
          ok: true,
          deployed: { type: "skill", name: "review", version: "v0.5.1" },
        },
      },
      {
        name: "docs",
        result: {
          ok: true,
          deployed: { type: "skill", name: "docs", version: "v0.5.1" },
        },
      },
    ]);
    expect(deployed).toEqual([
      {
        command: "install",
        target: repo("/registered/repo"),
        ref: "github.com/fimoklei/agent-harness#v0.5.1",
        skills: ["tdd", "review", "docs"],
      },
    ]);
  });

  const okRow = (name: string, version = "v0.5.1") => ({
    name,
    result: { ok: true, deployed: { type: "skill", name, version } },
  });

  it("leaves a name its own guard refuses out of the one install", async () => {
    const { deps, deployed } = buildDeps({
      inventory: skills("tdd", "review", "docs"),
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async (_tag, name) => name === "review",
        readSkillFilesAtTag: async () => null,
      },
    });

    const results = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review", "docs"],
      target: repo("/registered/repo"),
    });

    expect(results).toEqual([
      okRow("tdd"),
      {
        name: "review",
        result: { ok: false, error: "local-diverged-from-tag" },
      },
      okRow("docs"),
    ]);
    expect(deployed.map((call) => call.skills)).toEqual([["tdd", "docs"]]);
  });

  it("holds back an edited copy with a receipt its own deploy accepts", async () => {
    // Two held back: a receipt minted before the install would cover docs too,
    // which a single deploy of review never reads.
    const edited = new Set(["review", "docs"]);
    const { deps, deployed } = buildDeps({
      inventory: skills("tdd", "review", "docs"),
      deployedContent: {
        classify: async ({ name }) =>
          edited.has(name) ? ("diverged" as const) : ("not-deployed" as const),
        contentDigest: async () => null,
        linkedSkillPath: async () => null,
      },
    });
    const deploy = new DeploySkill(deps);

    const results = await deploy.executeBatch({
      names: ["tdd", "review", "docs"],
      target: repo("/registered/repo"),
    });

    expect(results[1]).toEqual({
      name: "review",
      result: {
        ok: false,
        error: "deployed-diverged-from-lock",
        copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
    expect(deployed.map((call) => call.skills)).toEqual([["tdd"]]);
    const refused = results[1]?.result;
    if (refused === undefined || refused.ok) {
      throw new Error("expected review to be held back");
    }

    const single = await deploy.execute({
      type: "skill",
      name: "review",
      target: repo("/registered/repo"),
      confirmedCopyReceipt: refused.copyReceipt,
    });

    expect(single).toEqual({
      ok: true,
      deployed: { type: "skill", name: "review", version: "v0.5.1" },
    });
  });

  it("installs nothing while a deployed copy outside the batch holds edits", async () => {
    // The one install rewrites every copy in the Selection, staged or not.
    const { deps, deployed, world } = buildDeps({
      inventory: skills("tdd", "review", "docs"),
      deployedContent: {
        classify: async ({ name }) =>
          name === "docs" ? ("diverged" as const) : ("not-deployed" as const),
        contentDigest: async () => null,
        linkedSkillPath: async () => null,
      },
    });
    world.seed({ release: "v0.5.1", skills: ["docs"] });

    const results = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review"],
      target: repo("/registered/repo"),
    });

    expect(results.map((row) => row.result)).toEqual([
      expect.objectContaining({
        ok: false,
        error: "deployed-diverged-from-lock",
      }),
      expect.objectContaining({
        ok: false,
        error: "deployed-diverged-from-lock",
      }),
    ]);
    expect(deployed).toEqual([]);
  });

  it("installs nothing while a staged name's deployed copy holds edits", async () => {
    const { deps, deployed, world } = buildDeps({
      inventory: skills("tdd", "review"),
      deployedContent: {
        classify: async ({ name }) =>
          name === "review" ? ("diverged" as const) : ("not-deployed" as const),
        contentDigest: async () => null,
        linkedSkillPath: async () => null,
      },
    });
    world.seed({ release: "v0.5.1", skills: ["review"] });

    const results = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review"],
      target: repo("/registered/repo"),
    });

    expect(results.map((row) => row.result)).toEqual([
      expect.objectContaining({
        ok: false,
        error: "deployed-diverged-from-lock",
      }),
      expect.objectContaining({
        ok: false,
        error: "deployed-diverged-from-lock",
      }),
    ]);
    expect(deployed).toEqual([]);
  });

  it("fails every name in the batch when the one install fails", async () => {
    const { deps, cleaned, world } = buildDeps({
      inventory: skills("tdd", "review"),
    });
    world.refuseWith("throw");

    const results = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review"],
      target: globalTarget,
    });

    expect(results).toEqual([
      { name: "tdd", result: { ok: false, error: "deploy-failed" } },
      { name: "review", result: { ok: false, error: "deploy-failed" } },
    ]);
    expect(cleaned).toEqual([]);
  });

  it("answers every name with a refusal that belongs to the whole target", async () => {
    const { deps, deployed } = buildDeps({
      inventory: skills("tdd", "review"),
      apm: {
        resolveLatestTag: async () => ({
          ok: false as const,
          reason: "auth-required" as const,
        }),
        deploySkill: async () => ({ ok: true as const }),
      },
    });

    const results = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review", "Not A Slug"],
      target: repo("/registered/repo"),
    });

    expect(results).toEqual([
      { name: "tdd", result: { ok: false, error: "auth-required" } },
      { name: "review", result: { ok: false, error: "auth-required" } },
      { name: "Not A Slug", result: { ok: false, error: "invalid-name" } },
    ]);
    expect(deployed).toEqual([]);
  });

  it("refuses a symlinked destination before apm, which would skip it silently", async () => {
    const { deps, deployed } = buildDeps({
      inventory: skills("tdd", "review"),
      deployedContent: {
        classify: async () => "not-deployed" as const,
        contentDigest: async () => null,
        linkedSkillPath: async ({ name }) =>
          name === "review" ? "/registered/repo/.claude/skills/review" : null,
      },
    });

    const results = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review"],
      target: repo("/registered/repo"),
    });

    expect(results).toEqual([
      okRow("tdd"),
      {
        name: "review",
        result: {
          ok: false,
          error: "destination-symlinked",
          linkedPath: "/registered/repo/.claude/skills/review",
        },
      },
    ]);
    expect(deployed.map((call) => call.skills)).toEqual([["tdd"]]);
  });
});
