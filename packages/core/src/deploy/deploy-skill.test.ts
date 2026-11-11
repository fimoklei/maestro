import { describe, expect, it } from "vitest";
import {
  type BulkDeployReport,
  type DeployedContentPort,
  type DeployedContentState,
  DeploySkill,
  type DeployTarget,
  type RecordedPackageResult,
  type ResolveLatestTagResult,
} from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import { deployedCopies } from "./deployed-content.fake";
import type { FolderOutcomes } from "./folder-outcome";
import { DEFAULT_GLOBAL_LAYOUT } from "./global-layout.fake";
import { InFlightLocks } from "./in-flight-locks";
import { LocalCopyGuard } from "./local-copy-guard";
import { selectionWorld } from "./selection-writer-fake";

const repo = (repoPath: string): DeployTarget => ({ kind: "repo", repoPath });
const globalTarget: DeployTarget = { kind: "global" };

// A real copy of `name` at the registered repo, in the named drift state.
const copyAt = (
  state: DeployedContentState,
  target: DeployTarget = repo("/registered/repo"),
  name = "tdd",
): DeployedContentPort => deployedCopies([{ target, name, state }]).content;

// Several skills at the registered repo, each in its named state.
const editedCopies = (
  states: Record<string, DeployedContentState>,
): DeployedContentPort =>
  deployedCopies(
    Object.entries(states).map(([name, state]) => ({
      target: repo("/registered/repo"),
      name,
      state,
    })),
  ).content;

// No drift, with the linked-directory answer scripted.
const withLinks = (
  linkedSkillPath: DeployedContentPort["linkedSkillPath"],
): DeployedContentPort => {
  const none = deployedCopies([]).content;
  return {
    readLockfile: (target) => none.readLockfile(target),
    classify: (input) => none.classify(input),
    contentDigest: (input) => none.contentDigest(input),
    linkedSkillPath,
  };
};

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
  const noCopies = deployedCopies([]).content;
  const base = {
    inventory: {
      read: async () => ({
        ok: true as const,
        primitives: [
          {
            type: "skill" as const,
            name: "tdd",
            description: "Test-driven development",
            path: ".apm/skills/tdd",
            pendingRelease: null,
          },
        ],
        unreadTypes: [],
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
    harnessOrigin: async () => ({
      host: "github.com",
      ownerRepo: "fimoklei/agent-harness",
    }),
    syncHarness: async () => {},
    inventoryGit: {
      skillExistsAtTag: async (_tag: string, _name: string) => true,
      skillDivergesFromTag: async (_tag: string, _name: string) => false,
      readSkillFilesAtTag: async (_tag: string, _name: string) => null,
    },
    deployedContent: {
      readLockfile: (target: DeployTarget) => noCopies.readLockfile(target),
      classify: async (
        input: Parameters<DeployedContentPort["classify"]>[0],
      ) => {
        const { lockfile: _shared, ...asked } = input;
        classified.push(asked);
        return noCopies.classify(input);
      },
      contentDigest: async (input: {
        target: DeployTarget;
        name: string;
        tools?: readonly SupportedTool[];
      }) => noCopies.contentDigest(input),
      linkedSkillPath: async () => null,
    },
    globalLayout: () => DEFAULT_GLOBAL_LAYOUT,
    toolPresence: {
      detectGlobalTools: async (): Promise<SupportedTool[]> => [
        "claude",
        "codex",
      ],
    },
    recordedPackage: {
      read: async () =>
        ({
          kind: "recorded",
          reading: { kind: "skill", name: "tdd" },
        }) as RecordedPackageResult,
    },
    canonicalPath: async (path: string) => path,
    locks: new InFlightLocks(),
    selection: world.writer,
    // The per-folder read is proven in its own tests and the bulk route's.
    outcomes: {
      read: async ({ release }: { release: string }) => ({
        release,
        folders: [],
      }),
    },
    ...overrides,
  };
  const copyGuard = new LocalCopyGuard({ content: base.deployedContent });
  const deps = { ...base, copyGuard };
  return { deps, deployed, classified, copyGuard, world };
};

describe("DeploySkill", () => {
  it("refuses to call an install that placed nothing a clean deploy", async () => {
    // apm prints its success marker whatever landed (#358, #951).
    const { deps, world } = buildDeps();
    world.landsOnly([]);

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "deploy-incomplete" });
  });

  it("completes a global deploy while an undetected tool's folder keeps its copies", async () => {
    const { deps, world } = buildDeps({
      globalLayout: () => DEFAULT_GLOBAL_LAYOUT,
      toolPresence: { detectGlobalTools: async () => ["claude"] },
    });
    world.seed({ release: "v0.5.1", skills: ["review"] });

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result.ok).toBe(true);
    expect(world.files.has("/target/.agents/skills/review/SKILL.md")).toBe(
      true,
    );
  });

  // Echoes the names read, one written copy each in Claude Code's folder.
  const echoedOutcomes = {
    read: async ({
      release,
      names,
    }: {
      release: string;
      names: readonly string[];
    }) => ({
      release,
      folders: [
        {
          path: "~/.claude/skills",
          tool: "claude" as const,
          detected: true,
          skills: names.map((name) => ({ name, outcome: "written" as const })),
        },
      ],
    }),
  };
  const outcomeNames = (outcome: FolderOutcomes | undefined) =>
    outcome?.folders.flatMap((folder) =>
      folder.skills.map((skill) => skill.name),
    );

  it("reads every Global folder back over the whole Selection the install wrote", async () => {
    const { deps, world } = buildDeps({ outcomes: echoedOutcomes });
    world.seed({ release: "v0.5.1", skills: ["review"] });

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd"],
      target: globalTarget,
    });

    expect(outcomeNames(report.outcome)).toEqual(["review", "tdd"]);
  });

  it("states the Global folders after a single deploy too", async () => {
    const { deps } = buildDeps({ outcomes: echoedOutcomes });

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result.ok ? outcomeNames(result.outcome) : null).toEqual(["tdd"]);
  });

  it("states no folders after a single deploy to a repository", async () => {
    const { deps } = buildDeps({ outcomes: echoedOutcomes });

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
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
      deployedContent: copyAt("unverifiable"),
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

  describe("a Harness copy that differs from the release a Behind target follows", () => {
    const behind = (
      divergesAt: (tag: string) => boolean,
      latest: ResolveLatestTagResult = { ok: true, tag: "v2.0.0" },
    ) => {
      const built = buildDeps({
        apm: {
          resolveLatestTag: async () => latest,
          deploySkill: async () => ({ ok: true as const }),
        },
        inventoryGit: {
          skillExistsAtTag: async () => true,
          skillDivergesFromTag: async (tag: string) => divergesAt(tag),
          readSkillFilesAtTag: async () => null,
        },
      });
      built.world.seed({ release: "v1.1.0", skills: ["review"] });
      return built;
    };
    const deployTdd = (deps: ReturnType<typeof behind>["deps"]) =>
      new DeploySkill(deps).execute({
        type: "skill",
        name: "tdd",
        target: repo("/registered/repo"),
      });

    it("refuses as Behind when the copy equals the latest release", async () => {
      const { deps, deployed } = behind((tag) => tag === "v1.1.0");

      expect(await deployTdd(deps)).toEqual({
        ok: false,
        error: "target-behind-release",
      });
      expect(deployed).toEqual([]);
    });

    it("refuses as unreleased when the copy differs from the latest release too", async () => {
      const { deps, deployed } = behind(() => true);

      expect(await deployTdd(deps)).toEqual({
        ok: false,
        error: "local-diverged-from-tag",
      });
      expect(deployed).toEqual([]);
    });

    it("refuses as unreleased when the latest release cannot be read", async () => {
      const { deps, deployed } = behind((tag) => tag === "v1.1.0", {
        ok: false,
        reason: "timed-out",
      });

      expect(await deployTdd(deps)).toEqual({
        ok: false,
        error: "local-diverged-from-tag",
      });
      expect(deployed).toEqual([]);
    });
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
      outcome: { release: "v0.5.1", folders: [] },
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
      globalLayout: () => DEFAULT_GLOBAL_LAYOUT,
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
      globalLayout: () => DEFAULT_GLOBAL_LAYOUT,
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

  it("refuses a global deploy when no supported tool is detected, before apm", async () => {
    // Both apm methods throw, proving apm is never invoked (#131).
    const { deps, deployed } = buildDeps({
      globalLayout: () => DEFAULT_GLOBAL_LAYOUT,
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
      globalLayout: () => DEFAULT_GLOBAL_LAYOUT,
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
      outcome: { release: "v0.5.1", folders: [] },
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

  // A prompt is never deployed; its name proves no skill exists.
  it("rejects a skill name that only a released prompt holds", async () => {
    const { deps, deployed } = buildDeps({
      inventory: {
        read: async () => ({
          ok: true as const,
          primitives: [
            {
              type: "prompt" as const,
              name: "pr-review",
              description: "",
              path: ".maestro/prompts/pr-review.md",
              pendingRelease: null,
              text: "Review\n",
              example: "",
              nameValid: true,
            },
          ],
          unreadTypes: [],
        }),
      },
    });

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "pr-review",
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
            {
              type: "skill" as const,
              name: "jobs",
              description: "The board",
              path: ".apm/skills/jobs",
              pendingRelease: null,
            },
            {
              type: "skill" as const,
              name: "tdd",
              description: "Test-driven development",
              path: ".apm/skills/tdd",
              pendingRelease: null,
            },
          ],
          unreadTypes: [],
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
    const { deps } = buildDeps({ harnessOrigin: async () => null });
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
      deployedContent: withLinks(
        async () => "/registered/repo/.claude/skills/tdd",
      ),
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

  it("reports deploy-timed-out for a timed-out install", async () => {
    const { deps, world } = buildDeps();
    world.refuseWith({ ok: false, reason: "timed-out" });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "deploy-timed-out" });
  });

  it("reports tag-check-timed-out and deploys nothing when the release lookup times out", async () => {
    const { deps, deployed } = buildDeps({
      apm: {
        resolveLatestTag: async () => ({ ok: false, reason: "timed-out" }),
        deploySkill: async () => {
          throw new Error("must not deploy after a timed-out resolve");
        },
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "tag-check-timed-out" });
    expect(deployed).toEqual([]);
  });

  it("reports a generic resolve failure as a deploy that did not start", async () => {
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

    expect(result).toEqual({ ok: false, error: "deploy-not-started" });
    expect(deployed).toEqual([]);
  });

  it("reports no-published-tag when the latest tag does not contain the skill", async () => {
    // apm view is repo-level: a tag existing says nothing about it containing the
    // skill (#15).
    const { deps, deployed } = buildDeps({
      inventoryGit: {
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
      deployedContent: copyAt("diverged"),
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
      deployedContent: copyAt("unverifiable"),
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
      deployedContent: copyAt("unreadable"),
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
      deployedContent: copyAt("lockfile-malformed"),
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
      deployedContent: copyAt("lockfile-malformed"),
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
      deployedContent: copyAt("clean"),
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
      deployedContent: copyAt("diverged", globalTarget),
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
      deployedContent: copyAt("diverged"),
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
      deployedContent: copyAt("unverifiable"),
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
      deployedContent: editedCopies({ tdd: "diverged", grill: "diverged" }),
      inventory: {
        read: async () => ({
          ok: true as const,
          primitives: [
            {
              type: "skill" as const,
              name: "tdd",
              description: "One",
              path: ".apm/skills/tdd",
              pendingRelease: null,
            },
            {
              type: "skill" as const,
              name: "grill",
              description: "Two",
              path: ".apm/skills/grill",
              pendingRelease: null,
            },
          ],
          unreadTypes: [],
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
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => true,
        readSkillFilesAtTag: async () => null,
      },
      deployedContent: copyAt("diverged"),
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
      deployedContent: copyAt("unreadable"),
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
      outcome: { release: "v0.5.1", folders: [] },
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

  it("reports a thrown tag resolution as a deploy that did not start", async () => {
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

    expect(result).toEqual({ ok: false, error: "deploy-not-started" });
    expect(deployed).toEqual([]);
  });

  it("reports a failure while the install's operation is still pending as a deploy that did not finish", async () => {
    // The guard reads links before the install too; only the refusal's probe fails.
    let installs: readonly unknown[] = [];
    const { deps, deployed, world } = buildDeps({
      deployedContent: withLinks(async () => {
        if (installs.length > 0) {
          throw new Error("lstat failed");
        }
        return null;
      }),
    });
    installs = deployed;
    world.refuseWith({ ok: false, reason: "destination-symlinked" });

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "deploy-failed" });
    expect(await world.operations.read("/registered/repo")).not.toBeNull();
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
        path: `.apm/skills/${name}`,
        pendingRelease: null,
      })),
      unreadTypes: [],
    }),
  });

  it("deploys every staged name in one install and reports each success", async () => {
    const { deps, deployed } = buildDeps({
      inventory: skills("tdd", "review", "docs"),
    });

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review", "docs"],
      target: repo("/registered/repo"),
    });

    expect(report).toEqual({
      target: repo("/registered/repo"),
      deployed: [
        { name: "tdd", version: "v0.5.1" },
        { name: "review", version: "v0.5.1" },
        { name: "docs", version: "v0.5.1" },
      ],
      attention: [],
      failed: [],
    });
    expect(deployed).toEqual([
      {
        command: "install",
        target: repo("/registered/repo"),
        ref: "github.com/fimoklei/agent-harness#v0.5.1",
        skills: ["tdd", "review", "docs"],
      },
    ]);
  });

  it("leaves a name its own guard refuses out of the one install", async () => {
    const { deps, deployed } = buildDeps({
      inventory: skills("tdd", "review", "docs"),
      inventoryGit: {
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async (_tag, name) => name === "review",
        readSkillFilesAtTag: async () => null,
      },
    });

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review", "docs"],
      target: repo("/registered/repo"),
    });

    expect(report.deployed).toEqual([
      { name: "tdd", version: "v0.5.1" },
      { name: "docs", version: "v0.5.1" },
    ]);
    expect(report.failed).toEqual([
      { error: "local-diverged-from-tag", names: ["review"] },
    ]);
    expect(deployed.map((call) => call.skills)).toEqual([["tdd", "docs"]]);
  });

  it("holds back an edited copy as a forceable row with a receipt its own deploy accepts", async () => {
    // Two held back: a receipt minted before the install would cover docs too,
    // which a single deploy of review never reads.
    const { deps, deployed } = buildDeps({
      inventory: skills("tdd", "review", "docs"),
      deployedContent: editedCopies({ review: "diverged", docs: "diverged" }),
    });
    const deploy = new DeploySkill(deps);

    const report = await deploy.executeBatch({
      names: ["tdd", "review", "docs"],
      target: repo("/registered/repo"),
    });

    expect(report.deployed).toEqual([{ name: "tdd", version: "v0.5.1" }]);
    expect(report.attention[0]).toEqual({
      name: "review",
      error: "deployed-diverged-from-lock",
      forceable: true,
      copyReceipt: expect.stringMatching(/^[0-9a-f]{64}$/),
      blockingCopies: [{ name: "review", verdict: "local-edits", folders: [] }],
    });
    expect(report.failed).toEqual([]);
    expect(deployed.map((call) => call.skills)).toEqual([["tdd"]]);

    const single = await deploy.execute({
      type: "skill",
      name: "review",
      target: repo("/registered/repo"),
      confirmedCopyReceipt: report.attention[0]?.copyReceipt,
    });

    expect(single).toEqual({
      ok: true,
      deployed: { type: "skill", name: "review", version: "v0.5.1" },
    });
  });

  it("reports a held name as not started when a failure follows a landed install", async () => {
    // The install landed and cleared its operation; the held name's re-check fails.
    const edited = editedCopies({ review: "diverged" });
    let installs: readonly unknown[] = [];
    const { deps, deployed, world } = buildDeps({
      inventory: skills("tdd", "review"),
      deployedContent: {
        readLockfile: (target) =>
          installs.length > 0
            ? Promise.reject(new Error("disk gone"))
            : edited.readLockfile(target),
        classify: (input) => edited.classify(input),
        contentDigest: (input) => edited.contentDigest(input),
        linkedSkillPath: async () => null,
      },
    });
    installs = deployed;

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review"],
      target: repo("/registered/repo"),
    });

    expect(report.deployed).toEqual([{ name: "tdd", version: "v0.5.1" }]);
    expect(report.failed).toEqual([
      { error: "deploy-not-started", names: ["review"] },
    ]);
    expect(await world.operations.read("/registered/repo")).toBeNull();
  });

  it("marks an unverifiable copy as forceable attention", async () => {
    const { deps } = buildDeps({
      inventory: skills("tdd"),
      deployedContent: editedCopies({ tdd: "unverifiable" }),
    });

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd"],
      target: repo("/registered/repo"),
    });

    expect(report.attention).toEqual([
      expect.objectContaining({
        name: "tdd",
        error: "deployed-unverifiable",
        forceable: true,
      }),
    ]);
  });

  it("never honours a receipt smuggled into the batch input", async () => {
    // A hand-built request body must never carry a batch-wide overwrite
    // consent through (#292, #952).
    const { deps, deployed } = buildDeps({
      deployedContent: editedCopies({ tdd: "diverged" }),
    });
    const deploy = new DeploySkill(deps);
    const refused = await deploy.execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });
    if (refused.ok) {
      throw new Error("expected tdd to be refused");
    }

    const report = await deploy.executeBatch({
      names: ["tdd"],
      target: repo("/registered/repo"),
      confirmedCopyReceipt: refused.copyReceipt,
    } as Parameters<DeploySkill["executeBatch"]>[0]);

    expect(report.attention).toEqual([
      expect.objectContaining({
        name: "tdd",
        error: "deployed-diverged-from-lock",
      }),
    ]);
    expect(deployed).toEqual([]);
  });

  it("installs nothing while a deployed copy outside the batch holds edits", async () => {
    // The one install rewrites every copy in the Selection, staged or not.
    const { deps, deployed, world } = buildDeps({
      inventory: skills("tdd", "review", "docs"),
      deployedContent: editedCopies({ docs: "diverged" }),
    });
    world.seed({ release: "v0.5.1", skills: ["docs"] });

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review"],
      target: repo("/registered/repo"),
    });

    expect(report.deployed).toEqual([]);
    expect(report.attention.map((row) => [row.name, row.error])).toEqual([
      ["tdd", "deployed-diverged-from-lock"],
      ["review", "deployed-diverged-from-lock"],
    ]);
    expect(deployed).toEqual([]);
  });

  it("names the deployed copy that holds a row, so its force names whose edits it replaces", async () => {
    const { deps, world } = buildDeps({
      inventory: skills("tdd", "docs"),
      deployedContent: editedCopies({ docs: "diverged" }),
    });
    world.seed({ release: "v0.5.1", skills: ["docs"] });

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd"],
      target: repo("/registered/repo"),
    });

    expect(report.attention).toEqual([
      expect.objectContaining({
        name: "tdd",
        blockingCopies: [{ name: "docs", verdict: "local-edits", folders: [] }],
      }),
    ]);
  });

  it("names a row's own edited copy beside the deployed copies that hold it", async () => {
    const { deps, world } = buildDeps({
      inventory: skills("tdd", "review", "docs"),
      deployedContent: editedCopies({
        tdd: "diverged",
        review: "unverifiable",
        docs: "diverged",
      }),
    });
    world.seed({ release: "v0.5.1", skills: ["review", "docs"] });

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd"],
      target: repo("/registered/repo"),
    });

    expect(report.attention).toEqual([
      expect.objectContaining({
        name: "tdd",
        blockingCopies: [
          { name: "review", verdict: "unverified", folders: [] },
          { name: "docs", verdict: "local-edits", folders: [] },
          { name: "tdd", verdict: "local-edits", folders: [] },
        ],
      }),
    ]);
  });

  it("names no copy apm itself left unverifiable among a row's holders", async () => {
    const { deps, world } = buildDeps({
      inventory: skills("tdd", "docs"),
      deployedContent: editedCopies({ tdd: "unverifiable", docs: "diverged" }),
      recordedPackage: {
        read: async ({ name }) =>
          name === "tdd"
            ? {
                kind: "recorded" as const,
                reading: {
                  kind: "unsupported" as const,
                  packageType: "hybrid",
                },
              }
            : { kind: "unverified" as const },
      },
    });
    world.seed({ release: "v0.5.1", skills: ["docs"] });

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd"],
      target: repo("/registered/repo"),
    });

    expect(report.attention).toEqual([
      expect.objectContaining({
        name: "tdd",
        blockingCopies: [{ name: "docs", verdict: "local-edits", folders: [] }],
      }),
    ]);
  });

  it("installs nothing while a staged name's deployed copy holds edits", async () => {
    const { deps, deployed, world } = buildDeps({
      inventory: skills("tdd", "review"),
      deployedContent: editedCopies({ review: "diverged" }),
    });
    world.seed({ release: "v0.5.1", skills: ["review"] });

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review"],
      target: repo("/registered/repo"),
    });

    expect(report.deployed).toEqual([]);
    expect(report.attention.map((row) => [row.name, row.error])).toEqual([
      ["tdd", "deployed-diverged-from-lock"],
      ["review", "deployed-diverged-from-lock"],
    ]);
    expect(deployed).toEqual([]);
  });

  it("fails every name on one line when the one install fails", async () => {
    const { deps, world } = buildDeps({
      inventory: skills("tdd", "review"),
    });
    world.refuseWith("throw");

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review"],
      target: globalTarget,
    });

    expect(report.failed).toEqual([
      { error: "deploy-failed", names: ["tdd", "review"] },
    ]);
  });

  it("fails every name when a read throws, leaking nothing it said", async () => {
    const { deps } = buildDeps({
      inventory: {
        read: async () => {
          throw new Error("ENOENT: filesystem read failed");
        },
      },
    });

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review"],
      target: globalTarget,
    });

    expect(report).toEqual({
      target: globalTarget,
      deployed: [],
      attention: [],
      failed: [{ error: "deploy-not-started", names: ["tdd", "review"] }],
    });
  });

  it("counts an install that did not land as a failure, never as a success", async () => {
    const { deps, world } = buildDeps();
    world.landsOnly([]);

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd"],
      target: repo("/registered/repo"),
    });

    expect(report.deployed).toEqual([]);
    expect(report.failed).toEqual([
      { error: "deploy-incomplete", names: ["tdd"] },
    ]);
  });

  it("merges identical failures into one line carrying every affected skill", async () => {
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

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review", "Not A Slug"],
      target: repo("/registered/repo"),
    });

    expect(report.failed).toEqual([
      { error: "auth-required", names: ["tdd", "review"] },
      { error: "invalid-name", names: ["Not A Slug"] },
    ]);
    expect(deployed).toEqual([]);
  });

  it("keeps each link apm would skip on its own failure line, before apm", async () => {
    // Each link has its own path and the Report spells out one rm per link
    // (#748), so linked skills never merge into one line.
    const { deps, deployed } = buildDeps({
      inventory: skills("tdd", "review", "docs"),
      deployedContent: withLinks(async ({ name }) =>
        name === "tdd" ? null : `/registered/repo/.claude/skills/${name}`,
      ),
    });

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review", "docs"],
      target: repo("/registered/repo"),
    });

    expect(report.deployed).toEqual([{ name: "tdd", version: "v0.5.1" }]);
    expect(report.failed).toEqual([
      {
        error: "destination-symlinked",
        names: ["review"],
        linkedPath: "/registered/repo/.claude/skills/review",
      },
      {
        error: "destination-symlinked",
        names: ["docs"],
        linkedPath: "/registered/repo/.claude/skills/docs",
      },
    ]);
    expect(deployed.map((call) => call.skills)).toEqual([["tdd"]]);
  });

  it("leaves a linked skill out of the receipt a held row's own deploy accepts", async () => {
    // docs is refused over its link, so a single deploy of review never reads
    // docs' edited copy.
    const copies = editedCopies({ review: "diverged", docs: "diverged" });
    const { deps } = buildDeps({
      inventory: skills("review", "docs"),
      deployedContent: {
        readLockfile: (target) => copies.readLockfile(target),
        classify: (input) => copies.classify(input),
        contentDigest: (input) => copies.contentDigest(input),
        linkedSkillPath: async ({ name }) =>
          name === "docs" ? "/registered/repo/.claude/skills/docs" : null,
      },
    });
    const deploy = new DeploySkill(deps);

    const report = await deploy.executeBatch({
      names: ["review", "docs"],
      target: repo("/registered/repo"),
    });
    const single = await deploy.execute({
      type: "skill",
      name: "review",
      target: repo("/registered/repo"),
      confirmedCopyReceipt: report.attention[0]?.copyReceipt,
    });

    expect(report.failed).toEqual([
      {
        error: "destination-symlinked",
        names: ["docs"],
        linkedPath: "/registered/repo/.claude/skills/docs",
      },
    ]);
    expect(single).toEqual({
      ok: true,
      deployed: { type: "skill", name: "review", version: "v0.5.1" },
    });
  });

  it("carries the linked path and the Update target recovery a single deploy carries", async () => {
    // Routing a single Deploy through bulk once dropped both (aae48156): a
    // skill missing from the followed release must stay attention, so the
    // Report offers Update target, and a link must keep its path.
    const { deps, world } = buildDeps({
      inventory: skills("tdd", "review", "docs"),
      inventoryGit: {
        skillExistsAtTag: async (_tag, name) => name !== "tdd",
        skillDivergesFromTag: async () => false,
        readSkillFilesAtTag: async () => null,
      },
      deployedContent: withLinks(async ({ name }) =>
        name === "review" ? "/registered/repo/.claude/skills/review" : null,
      ),
    });
    world.seed({ release: "v0.4.0", skills: ["docs"] });

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd", "review"],
      target: repo("/registered/repo"),
    });

    expect(report).toEqual({
      target: repo("/registered/repo"),
      deployed: [],
      attention: [
        { name: "tdd", error: "not-at-target-release", forceable: false },
      ],
      failed: [
        {
          error: "destination-symlinked",
          names: ["review"],
          linkedPath: "/registered/repo/.claude/skills/review",
        },
      ],
    });
  });

  it("reports a target pinned per skill as attention, with no force to offer", async () => {
    // A bulk deploy never grants consent or moves a release (#951).
    const { deps, world } = buildDeps();
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

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd"],
      target: repo("/registered/repo"),
    });

    expect(report.attention).toEqual([
      { name: "tdd", error: "target-pinned-per-skill", forceable: false },
    ]);
    expect(report.failed).toEqual([]);
  });

  it("reports a busy target as attention, with no force to offer", async () => {
    const { deps } = buildDeps();
    let release: () => void = () => undefined;
    const held = deps.locks.run(
      "/registered/repo",
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd"],
      target: repo("/registered/repo"),
    });
    release();
    await held;

    expect(report.attention).toEqual([
      { name: "tdd", error: "deploy-in-progress", forceable: false },
    ]);
    expect(report.failed).toEqual([]);
  });

  it("reports an unfinished operation as attention, with no force to offer", async () => {
    const { deps, world } = buildDeps();
    world.landsOnly([]);
    const deploy = new DeploySkill(deps);
    await deploy.executeBatch({
      names: ["tdd"],
      target: repo("/registered/repo"),
    });
    world.landsOnly(null);

    const report = await deploy.executeBatch({
      names: ["tdd"],
      target: repo("/registered/repo"),
    });

    expect(report.attention).toEqual([
      { name: "tdd", error: "operation-unfinished", forceable: false },
    ]);
    expect(report.failed).toEqual([]);
  });

  it("reports an unrecognised manifest as attention, with no force to offer", async () => {
    const { deps, world } = buildDeps();
    world.seed({ release: "v0.4.0", skills: ["review"] });
    world.files.set(
      "/target/apm.yml",
      "dependencies:\n  apm:\n    - github.com/fimoklei/agent-harness#v0.4.0\n",
    );

    const report = await new DeploySkill(deps).executeBatch({
      names: ["tdd"],
      target: repo("/registered/repo"),
    });

    expect(report.attention).toEqual([
      { name: "tdd", error: "manifest-not-recognised", forceable: false },
    ]);
    expect(report.failed).toEqual([]);
  });
});

describe("DeploySkill.deployAgain", () => {
  const skills = (...names: string[]) => ({
    read: async () => ({
      ok: true as const,
      primitives: names.map((name) => ({
        type: "skill" as const,
        name,
        description: name,
        path: `.apm/skills/${name}`,
        pendingRelease: null,
      })),
      unreadTypes: [],
    }),
  });

  // commit-message is on Global with local edits in the Claude Code folder.
  const heldOnGlobal = () => {
    const fake = deployedCopies([
      {
        target: globalTarget,
        name: "commit-message",
        state: { claude: "diverged" },
      },
    ]);
    const built = buildDeps({
      inventory: skills("code-review", "commit-message"),
      deployedContent: fake.content,
    });
    built.world.seed({ release: "v0.5.1", skills: ["commit-message"] });
    return { ...built, fake };
  };

  const heldRows = (report: BulkDeployReport) =>
    report.attention.map((row) => ({
      name: row.name,
      confirmedCopyReceipt: row.copyReceipt ?? "",
    }));

  it("names the Global folder of the copy that holds every skill", async () => {
    const { deps } = heldOnGlobal();

    const report = await new DeploySkill(deps).executeBatch({
      names: ["code-review", "commit-message"],
      target: globalTarget,
    });

    expect(report.deployed).toEqual([]);
    const blocking = [
      {
        name: "commit-message",
        verdict: "local-edits",
        folders: ["~/.claude/skills"],
      },
    ];
    expect(report.attention).toEqual([
      expect.objectContaining({
        name: "code-review",
        blockingCopies: blocking,
      }),
      expect.objectContaining({
        name: "commit-message",
        blockingCopies: blocking,
      }),
    ]);
  });

  it("deploys every held skill in one install with each held row's receipt", async () => {
    const { deps, deployed } = heldOnGlobal();
    const deploy = new DeploySkill(deps);
    const held = await deploy.executeBatch({
      names: ["code-review", "commit-message"],
      target: globalTarget,
    });

    const report = await deploy.deployAgain({
      target: globalTarget,
      held: heldRows(held),
    });

    expect(report.deployed).toEqual([
      { name: "code-review", version: "v0.5.1" },
      { name: "commit-message", version: "v0.5.1" },
    ]);
    expect(report.attention).toEqual([]);
    expect(report.outcome).toEqual({ release: "v0.5.1", folders: [] });
    expect(deployed.map((call) => call.skills)).toEqual([
      ["commit-message", "code-review"],
    ]);
  });

  it("holds again when the copy changed after the receipts were minted", async () => {
    const { deps, deployed, fake } = heldOnGlobal();
    const deploy = new DeploySkill(deps);
    const held = await deploy.executeBatch({
      names: ["code-review", "commit-message"],
      target: globalTarget,
    });
    fake.editFile(
      `${fake.treeRoot(globalTarget)}/.claude/skills/commit-message/SKILL.md`,
      "commit-message, edited twice\n",
    );

    const report = await deploy.deployAgain({
      target: globalTarget,
      held: heldRows(held),
    });

    expect(report.deployed).toEqual([]);
    expect(report.attention.map((row) => row.name)).toEqual([
      "code-review",
      "commit-message",
    ]);
    expect(deployed).toEqual([]);
  });

  it("never lets one skill's receipt cover another skill's edited copy", async () => {
    // docs is not deployed yet, but an edited copy sits in its folder.
    const fake = deployedCopies([
      { target: globalTarget, name: "docs", state: { claude: "diverged" } },
    ]);
    const { deps, deployed } = buildDeps({
      inventory: skills("tdd", "docs"),
      deployedContent: fake.content,
    });
    const deploy = new DeploySkill(deps);
    const refused = await deploy.execute({
      type: "skill",
      name: "docs",
      target: globalTarget,
    });
    if (refused.ok) {
      throw new Error("expected docs to be refused");
    }

    const report = await deploy.deployAgain({
      target: globalTarget,
      held: [
        { name: "tdd", confirmedCopyReceipt: refused.copyReceipt ?? "" },
        { name: "docs", confirmedCopyReceipt: "" },
      ],
    });

    expect(report.deployed).toEqual([{ name: "tdd", version: "v0.5.1" }]);
    expect(report.attention.map((row) => row.name)).toEqual(["docs"]);
    expect(deployed.map((call) => call.skills)).toEqual([["tdd"]]);
  });
});
