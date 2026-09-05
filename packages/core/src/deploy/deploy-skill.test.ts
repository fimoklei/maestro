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

const repo = (repoPath: string): DeployTarget => ({ kind: "repo", repoPath });
const globalTarget: DeployTarget = { kind: "global" };

// A destination in one state with no symlinked copy — what every guard test
// but the symlink one needs.
const contentState = (state: DeployedContentState): DeployedContentPort => ({
  classify: async () => state,
  linkedSkillPath: async () => null,
});

// In-memory fakes: real objects honoring the ports, no I/O.
const buildDeps = (
  overrides?: Partial<ConstructorParameters<typeof DeploySkill>[0]>,
) => {
  const deployed: Array<{
    target: DeployTarget;
    ref: string;
    tools?: readonly SupportedTool[];
  }> = [];
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
  const deps = {
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
      deploySkill: async (input: {
        target: DeployTarget;
        ref: string;
        tools?: readonly SupportedTool[];
      }) => {
        deployed.push(input);
        return { ok: true as const };
      },
    },
    inventoryOriginUrl: async () => "git@github.com:fimoklei/agent-harness.git",
    inventoryGit: {
      syncBeforeDeploy: async () => {},
      skillExistsAtTag: async (_tag: string, _name: string) => true,
      skillDivergesFromTag: async (_tag: string, _name: string) => false,
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
    ...overrides,
  };
  return { deps, deployed, classified, cleaned };
};

describe("DeploySkill", () => {
  it("refuses to call a hybrid record a clean deploy, and leaves its files alone", async () => {
    const { deps, cleaned } = buildDeps({
      recordedPackage: {
        read: async () => ({
          kind: "recorded" as const,
          reading: { kind: "unsupported" as const, packageType: "hybrid" },
        }),
      },
    });

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({
      ok: false,
      error: "deployed-unsupported-package-type",
      packageType: "hybrid",
    });
    expect(cleaned).toEqual([]);
  });

  it("refuses to call a marketplace_plugin record a clean deploy", async () => {
    const { deps } = buildDeps({
      recordedPackage: {
        read: async () => ({
          kind: "recorded" as const,
          reading: {
            kind: "unsupported" as const,
            packageType: "marketplace_plugin",
          },
        }),
      },
    });

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: globalTarget,
    });

    expect(result).toEqual({
      ok: false,
      error: "deployed-unsupported-package-type",
      packageType: "marketplace_plugin",
    });
  });

  it("reports apm's invalid verdict as a failed deploy, never as a success", async () => {
    const { deps } = buildDeps({
      recordedPackage: {
        read: async () => ({
          kind: "recorded" as const,
          reading: { kind: "invalid" as const, packageType: "invalid" },
        }),
      },
    });

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({
      ok: false,
      error: "deploy-recorded-invalid",
      packageType: "invalid",
    });
  });

  it("deploys a corrected release over an unsupported result, through the normal flow", async () => {
    // Run one records hybrid and is refused. Its files stay, with no baseline
    // of their own, which the guard would normally refuse as unverifiable —
    // but they are apm's, not local work, so the corrected release goes
    // through unforced (#358).
    let installs = 0;
    const reads: string[] = [];
    const { deps } = buildDeps({
      deployedContent: {
        classify: async () =>
          installs === 0
            ? ("not-deployed" as const)
            : ("unverifiable" as const),
        linkedSkillPath: async () => null,
      },
      recordedPackage: {
        read: async () => {
          reads.push("read");
          if (installs === 0) {
            return { kind: "unverified" as const };
          }
          return installs === 1
            ? {
                kind: "recorded" as const,
                reading: {
                  kind: "unsupported" as const,
                  packageType: "hybrid",
                },
              }
            : {
                kind: "recorded" as const,
                reading: { kind: "skill" as const, name: "tdd" },
              };
        },
      },
      apm: {
        resolveLatestTag: async () => ({ ok: true as const, tag: "v0.5.1" }),
        deploySkill: async () => {
          installs += 1;
          return { ok: true as const };
        },
      },
    });
    const deploy = new DeploySkill(deps);
    const request = {
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    };

    expect(await deploy.execute(request)).toEqual({
      ok: false,
      error: "deployed-unsupported-package-type",
      packageType: "hybrid",
    });
    expect(await deploy.execute(request)).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
  });

  it("refuses to call an install clean when the record cannot be read", async () => {
    // apm's own marker is the evidence this read exists to distrust, so an
    // unreadable record fails closed rather than passing as success (#58).
    const { deps } = buildDeps({
      recordedPackage: { read: async () => ({ kind: "unverified" as const }) },
    });

    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
    });

    expect(result).toEqual({ ok: false, error: "deploy-unverified" });
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
    expect(deployed).toEqual([
      {
        target: repo("/registered/repo"),
        ref: "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.5.1",
      },
    ]);
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
        target: globalTarget,
        ref: "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.5.1",
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
        target: globalTarget,
        ref: "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.5.1",
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
      { target: globalTarget, name: "tdd", tools: ["claude"] },
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

    expect(classified).toEqual([
      { target: repo("/registered/repo"), name: "tdd", tools: undefined },
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
    const { deps, cleaned } = buildDeps({
      toolPresence: { detectGlobalTools: async () => ["codex"] },
      apm: {
        resolveLatestTag: async () => ({ ok: true, tag: "v0.5.1" }),
        deploySkill: async () => {
          throw new Error("apm install failed");
        },
      },
    });
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
        target: repo("/registered/repo"),
        ref: "github.com/fimoklei/agent-harness/.apm/skills/tdd#v0.5.1",
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
    const { deps } = buildDeps({
      apm: {
        resolveLatestTag: async () => ({ ok: true as const, tag: "v0.5.1" }),
        deploySkill: async () => ({
          ok: false as const,
          reason: "destination-symlinked" as const,
        }),
      },
    });
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
    const { deps } = buildDeps({
      apm: {
        resolveLatestTag: async () => ({ ok: true as const, tag: "v0.5.1" }),
        deploySkill: async () => ({
          ok: false as const,
          reason: "destination-symlinked" as const,
        }),
      },
      deployedContent: {
        classify: async () => "not-deployed" as const,
        linkedSkillPath: async () => "/registered/repo/.claude/skills/tdd",
      },
    });
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
    const { deps } = buildDeps({
      apm: {
        resolveLatestTag: async () => ({ ok: true as const, tag: "v0.5.1" }),
        deploySkill: async () => ({
          ok: false as const,
          reason: "failed" as const,
        }),
      },
    });
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

    expect(result).toEqual({
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

    expect(result).toEqual({
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

  it("force still refuses a malformed lockfile", async () => {
    // force overrides only the not-proven-clean states (diverged, unverifiable).
    // A malformed lockfile is not non-precious drift: we cannot read the baseline
    // at all, so a forced overwrite would be blind. Refuse even under force (#58).
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("lockfile-malformed"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
      force: true,
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

    expect(result).toEqual({
      ok: false,
      error: "deployed-diverged-from-lock",
    });
    expect(deployed).toEqual([]);
  });

  it("force-deploys past a diverged deployed copy (confirm-and-proceed)", async () => {
    // ADR-0006: a not-proven-clean deployed copy is non-precious generated
    // content. With an explicit force (the cockpit's confirmed reinstall), the
    // destination guard is skipped and the skill reinstalls at the latest tag,
    // discarding the local edits — never the default, always opt-in (#66).
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("diverged"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
      force: true,
    });

    expect(result).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(deployed).toHaveLength(1);
  });

  it("force-deploys past an unverifiable deployed copy (self-healing)", async () => {
    // A pre-0.20.0 copy has no baseline to verify; a confirmed force reinstalls
    // fresh, after which apm writes deployed_file_hashes and the copy becomes
    // verifiable on the next pass — no bulk update-all (ADR-0006, #66).
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("unverifiable"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
      force: true,
    });

    expect(result.ok).toBe(true);
    expect(deployed).toHaveLength(1);
  });

  it("force skips only the destination guard — source divergence still refuses", async () => {
    // force is a narrow override of the destination guard, not a master switch.
    // A source tree that diverges from the tag would ship stale content, so that
    // guard still bites even under force (#66).
    const { deps, deployed } = buildDeps({
      inventoryGit: {
        syncBeforeDeploy: async () => {},
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => true,
      },
      deployedContent: contentState("diverged"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
      force: true,
    });

    expect(result).toEqual({ ok: false, error: "local-diverged-from-tag" });
    expect(deployed).toEqual([]);
  });

  it("force still refuses an unreadable deployed copy", async () => {
    // unreadable (#59) is not non-precious drift — we cannot read what is there,
    // so a forced overwrite would be a blind one, not an informed choice. The
    // confirm-and-proceed path covers diverged/unverifiable only (ADR-0006, #66).
    const { deps, deployed } = buildDeps({
      deployedContent: contentState("unreadable"),
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      target: repo("/registered/repo"),
      force: true,
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
    let failFirst = true;
    const { deps } = buildDeps({
      apm: {
        resolveLatestTag: async () => ({ ok: true, tag: "v0.5.1" }),
        deploySkill: async () => {
          if (failFirst) {
            failFirst = false;
            return { ok: false as const, reason: "failed" as const };
          }
          return { ok: true as const };
        },
      },
    });
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
    await expect(useCase.execute(input)).resolves.toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
  });

  it("turns an apm install failure into a typed deploy-failed error", async () => {
    // apm can reject (CLI missing, no auth/network, skill absent at the tag).
    // The use-case must own that as a typed error, never let it escape as an
    // unhandled rejection the route would surface as a raw 500.
    const { deps } = buildDeps({
      apm: {
        resolveLatestTag: async () => ({ ok: true, tag: "v0.5.1" }),
        deploySkill: async () => {
          throw new Error("apm exited 1 with a token in stderr");
        },
      },
    });
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
