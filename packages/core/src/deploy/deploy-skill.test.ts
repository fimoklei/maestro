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

// A destination in one state with no symlinked copy — what every guard test
// but the symlink one needs.
const contentState = (state: DeployedContentState): DeployedContentPort => ({
  classify: async () => state,
  contentDigest: async () => null,
  linkedSkillPath: async () => null,
});

// In-memory fakes: real objects honoring the ports, no I/O. `deployedContent`
// is the whole port here, because the guard built below reads its `classify`
// while the use-case only ever asks it for a linked destination.
const buildDeps = (
  overrides?: Partial<
    Omit<ConstructorParameters<typeof DeploySkill>[0], "deployedContent">
  > & { deployedContent?: DeployedContentPort },
) => {
  // The Selection lifecycle behind the use-case: apm's calls, the manifest and
  // the files all live here, so a deploy is judged by what landed (#951).
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
      // Never reached: the install runs inside the Selection writer, which is
      // the one owner of a write over a deployed copy (#951).
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
    // A two-tool machine by default; individual tests narrow this to prove the
    // global `-t` follows detected presence (ADR-0011, #131).
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
  // The real guard over the fake classifier: the refusal and consent rules are
  // the guard's, and the use-case tests prove it is wired to them (#952).
  const copyGuard = new LocalCopyGuard({ content: base.deployedContent });
  const deps = { ...base, copyGuard };
  return { deps, deployed, classified, cleaned, copyGuard, world };
};

describe("DeploySkill", () => {
  it("refuses to call an install that placed nothing a clean deploy", async () => {
    // apm prints its success marker whatever landed, so the disk and the
    // deployment record are the only honest verdict (#358, #951).
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
    // The standing copy has no baseline of its own, which the guard would
    // normally refuse as unverifiable — but it is apm's own, not local work, so
    // the corrected release goes through unforced (#358).
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
    // With no readable record there is no selection to add to, so the write
    // fails closed rather than installing over an unknown target (#58, #951).
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
    // The repository root with the whole Selection, never a per-skill subpath
    // ref (ADR-0031).
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
    // Global carries no path, so the registry never gates it; it shares the
    // inventory, origin, tag, and drift checks with a repo deploy (J07).
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
    // ADR-0011: a Claude-only machine must get -t claude, never claude,codex —
    // otherwise apm writes a dead .agents/ tree for a tool the user lacks. The
    // detected subset is passed straight through to the driver (#131).
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
    // #136: a Claude-only machine must ask the guard about the claude copy only,
    // so an untargeted .agents copy left by a prior two-tool install cannot force
    // a false refusal. The detected set is passed straight into classify.
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
    // The repo path scans every DEPLOY_TOOLS copy (#136): classify is called
    // without a tools scope, preserving the pre-#136 behaviour.
    const { deps, classified } = buildDeps();
    await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    // No tool scope, and the release the deploy is about to install, so a copy
    // already equal to it is not read as local edits (#952).
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
    // ADR-0011 / #136: a Codex-only machine that once ran a two-tool global
    // install has a .claude copy apm leaves behind. Claude Code is the only
    // reader of .claude/skills/, so its absence proves that copy is dead wood
    // and the narrowed install removes exactly it.
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
    // #202: an undetected Codex leaves .agents/skills/ behind, but Cursor,
    // Copilot, Gemini and others read that same directory. Maestro cannot prove
    // the tree is dead, so a Claude-only narrowing removes nothing at all.
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
    // A full two-tool machine narrows nothing away — there is no obsolete copy,
    // so the cleanup step is skipped entirely.
    const { deps, cleaned } = buildDeps();
    await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(cleaned).toEqual([]);
  });

  it("never cleans on a repo deploy", async () => {
    // Obsolete-target reconciliation is the global path only (#136); a repo
    // deploy targets every tool and touches no untargeted copy.
    const { deps, cleaned } = buildDeps();
    await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(cleaned).toEqual([]);
  });

  it("does not clean when the global install fails", async () => {
    // Cleanup runs only after a proven-successful install: a failed apm install
    // must not trigger removal of an untargeted copy (no half-reconciled state).
    // Codex-only, so a successful install here would have cleaned .claude.
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
    // The install already succeeded; reconciling the dead copy is best-effort.
    // A cleanup failure must not invert a proven-successful deploy to
    // deploy-failed — it leaves the pre-existing dead tree, which the next
    // deploy retries idempotently (#136).
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
    // No Claude, no Codex → there is nothing to deploy to. Refuse with a typed
    // error and never invoke apm (proven by making both apm methods throw) — a
    // bare install would otherwise fail on "Multiple harnesses" or write nothing
    // (ADR-0011, #131).
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
    // Presence gating is the global path only; a repo deploy is unaffected
    // (#131). Proven by making detection throw if touched.
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
    // The repo path passes no tools; the driver keeps its own -t claude,codex.
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
    // A global deploy crosses no client-supplied path, so the registry gate
    // must not run — proven by making it throw if touched (security.md, J07).
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
    // Skill-only is a business rule in core, not a schema shape at the edge:
    // the edge accepts any string so the user gets an honest message instead
    // of a generic 400 (issue #15).
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
    // The inventory check asks whether the name is among the primitives, not
    // whether every primitive carries it: a real inventory holds many.
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

  // A release Maestro could not read says nothing about the connection; calling
  // it "not configured" would send the author to re-connect a live harness.
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
    // Security rule: a path-taking endpoint must reject an unregistered repo
    // before any filesystem access. So an unregistered path must never even
    // reach inventory.read() — proven by making that read throw if called.
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
    // Missing/expired GitHub auth bites at resolveLatestTag (apm view), never
    // reaching install. Surface it as its own error, not the generic
    // deploy-failed, so the cockpit tells the user to re-auth (#119).
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
    // apm refuses to deploy into a skill directory that is a symlink. Surface
    // that classification instead of the generic deploy-failed, so the cockpit
    // can name the destination and the directory-level symlink fix (#180).
    // Fail-closed on the path: a link that vanished between apm's refusal and
    // the probe leaves the generic sentence, never a guessed path (#748).
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
    // The refusal is only actionable with the exact path: "the link" is the
    // leaf skill dir, and the reader has no other way to learn which one (#748).
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
    // Fail-closed: only a recognised refusal gets a typed error; everything else
    // stays the catch-all (#180).
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
    // Network down / host unreachable / CLI missing — anything that is not auth
    // stays the generic apm failure (auth-only classification scope, #119).
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
    // apm view is repo-level: a tag existing says nothing about it containing
    // skills/<name>. A skill added centrally but never tagged must yield a
    // "tag and push central" error, not deploy something else (issue #15).
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
    // Deploying would silently ship the tag's (stale) content while the user
    // looks at their edited local version — refuse and tell them to tag &
    // push instead (ADR-0003: surface the gap, never hide it).
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
    // The content-drift guard is target-agnostic: shipping stale content
    // globally is as wrong as shipping it to a repo (J07).
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
    // The source guard checks the inventory clone; this guards the destination.
    // A same-ref apm install silently resets a locally-edited deployed subtree
    // to the tag (apm-driver.md). Refuse so those edits are never dropped
    // unannounced — refuse-only, the user reconciles before re-deploying (#56).
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
    // A pre-0.20.0 entry has no deployed_file_hashes, so we have no baseline to
    // tell whether the deployed copy was edited. Refuse rather than let a
    // same-ref install silently reset possible local edits — the user reconciles
    // (e.g. removes the deployed copy) so a clean re-install can proceed (#56).
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
    // The destination exists but cannot be walked or read (permission denied, a
    // file where a directory was expected). We cannot prove it safe to
    // overwrite, so refuse with a distinct error rather than proceed or
    // miscategorise it as a generic apm execution failure (#59).
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
    // A present but malformed apm.lock.yaml gives no trustworthy baseline. The
    // guard surfaces it distinctly so a deploy never proceeds against an unknown
    // recorded state — a malformed lockfile is a visible error, not "nothing
    // deployed" (#58).
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
    // Consent covers the two not-proven-clean states (local edits, unverified).
    // A malformed lockfile is not non-precious drift: we cannot read the
    // baseline at all, so the overwrite would be blind. The refusal therefore
    // mints no receipt, and a made-up one clears nothing (#58, #952).
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
    // A clean deployed copy has nothing to lose to a same-ref install, so an
    // update/re-deploy proceeds — the guard bites only on local edits (#56).
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
    // The destination guard is target-agnostic: a locally-edited global subtree
    // (~/.claude/skills/<name>) must not be silently reset either (J07, #56).
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
    // ADR-0006: a not-proven-clean deployed copy is non-precious generated
    // content. The refusal mints the receipt that licenses overwriting exactly
    // the copies it read; sending it back reinstalls at the latest tag and
    // discards the local edits — never the default, always opt-in (#66, #952).
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
    // A pre-0.20.0 copy has no baseline to verify; the consented reinstall
    // lands fresh, after which apm writes deployed_file_hashes and the copy
    // becomes verifiable on the next pass (ADR-0006, #952).
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
    // The consent names the copies it was read against, so it can never be
    // lifted off one refusal and spent on another (#952).
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
    // Consent is a narrow licence for the destination, not a master switch. A
    // source tree that diverges from the tag would ship stale content, so that
    // guard still bites (#66).
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
    // unreadable (#59) is not non-precious drift — we cannot read what is
    // there, so the overwrite would be blind, not an informed choice. The
    // refusal carries no receipt at all (ADR-0006, #952).
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
    // The lock keys on the canonical path, so a symlinked spelling of the
    // same repo cannot race the same apm.lock.yaml (issue #15).
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
    // Global locks on its own fixed key, so two clicks on "Global" cannot race
    // the user-scope apm.lock.yaml (J07).
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
    // The second attempt is refused for what the first one left behind, not
    // because the lock was never given back.
    await expect(useCase.execute(input)).resolves.toEqual({
      ok: false,
      error: "operation-unfinished",
    });
  });

  it("turns an apm install failure into a typed deploy-failed error", async () => {
    // apm can reject (CLI missing, no auth/network, skill absent at the tag).
    // The use-case must own that as a typed error, never let it escape as an
    // unhandled rejection the route would surface as a raw 500.
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

// A bulk deploy: one lock, one install carrying every name that passed its
// guards (#1039).
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

    // Minted against what landed, so the row's single deploy is licensed.
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
    // Staged or not, a deployed name stays in the Selection, so the install
    // would rewrite its copy even with the name held back.
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
