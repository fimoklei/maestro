import { describe, expect, it } from "vitest";
import { DeploySkill } from "./deploy-skill";

// In-memory fakes: real objects honoring the ports, no I/O.
const buildDeps = (
  overrides?: Partial<ConstructorParameters<typeof DeploySkill>[0]>,
) => {
  const deployed: Array<{ repoPath: string; ref: string }> = [];
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
      resolveLatestTag: async (_ownerRepo: string) => "v0.5.1",
      deploySkill: async (input: { repoPath: string; ref: string }) => {
        deployed.push(input);
      },
    },
    inventoryOriginUrl: async () => "git@github.com:fimoklei/agent-harness.git",
    inventoryGit: {
      skillExistsAtTag: async (_tag: string, _name: string) => true,
      skillDivergesFromTag: async (_tag: string, _name: string) => false,
    },
    canonicalPath: async (path: string) => path,
    ...overrides,
  };
  return { deps, deployed };
};

describe("DeploySkill", () => {
  it("deploys a known skill to a registered repo at the latest tag", async () => {
    const { deps, deployed } = buildDeps();
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      repoPath: "/registered/repo",
    });

    expect(result).toEqual({
      ok: true,
      deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
    });
    expect(deployed).toEqual([
      {
        repoPath: "/registered/repo",
        ref: "github.com/fimoklei/agent-harness/skills/tdd#v0.5.1",
      },
    ]);
  });

  it("rejects a non-skill primitive type, before touching any port", async () => {
    // Skill-only is a business rule in core, not a schema shape at the edge:
    // the edge accepts any string so the user gets an honest message instead
    // of a generic 400 (issue #15).
    const { deps, deployed } = buildDeps();
    const result = await new DeploySkill(deps).execute({
      type: "hook",
      name: "tdd",
      repoPath: "/registered/repo",
    });

    expect(result).toEqual({ ok: false, error: "unsupported-primitive-type" });
    expect(deployed).toEqual([]);
  });

  it("rejects a name that is not a strict slug, before touching any port", async () => {
    const { deps, deployed } = buildDeps();
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "; rm -rf ~",
      repoPath: "/registered/repo",
    });

    expect(result).toEqual({ ok: false, error: "invalid-name" });
    expect(deployed).toEqual([]);
  });

  it("rejects a skill that is not in the inventory", async () => {
    const { deps, deployed } = buildDeps();
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "unknown-skill",
      repoPath: "/registered/repo",
    });

    expect(result).toEqual({ ok: false, error: "unknown-skill" });
    expect(deployed).toEqual([]);
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
      repoPath: "/registered/repo",
    });

    expect(result).toEqual({ ok: false, error: "inventory-not-configured" });
  });

  it("rejects a repo that is not in the registry", async () => {
    const { deps, deployed } = buildDeps();
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      repoPath: "/somewhere/else",
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
      repoPath: "/somewhere/else",
    });

    expect(result).toEqual({ ok: false, error: "repo-not-registered" });
  });

  it("reports an unavailable or unparseable inventory origin", async () => {
    const { deps } = buildDeps({ inventoryOriginUrl: async () => null });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      repoPath: "/registered/repo",
    });

    expect(result).toEqual({
      ok: false,
      error: "inventory-origin-unavailable",
    });
  });

  it("reports no-published-tag when the inventory has no tag at all", async () => {
    const { deps, deployed } = buildDeps({
      apm: {
        resolveLatestTag: async () => null,
        deploySkill: async () => {
          throw new Error("must not deploy without a tag");
        },
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      repoPath: "/registered/repo",
    });

    expect(result).toEqual({ ok: false, error: "no-published-tag" });
    expect(deployed).toEqual([]);
  });

  it("reports no-published-tag when the latest tag does not contain the skill", async () => {
    // apm view is repo-level: a tag existing says nothing about it containing
    // skills/<name>. A skill added centrally but never tagged must yield a
    // "tag and push central" error, not deploy something else (issue #15).
    const { deps, deployed } = buildDeps({
      inventoryGit: {
        skillExistsAtTag: async () => false,
        skillDivergesFromTag: async () => false,
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      repoPath: "/registered/repo",
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
        skillExistsAtTag: async () => true,
        skillDivergesFromTag: async () => true,
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      repoPath: "/registered/repo",
    });

    expect(result).toEqual({
      ok: false,
      error: "local-diverged-from-tag",
    });
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
        resolveLatestTag: async () => "v0.5.1",
        deploySkill: async () => gate,
      },
      canonicalPath: async (_path: string) => "/canonical/repo",
    });
    const useCase = new DeploySkill(deps);

    const first = useCase.execute({
      type: "skill",
      name: "tdd",
      repoPath: "/registered/repo",
    });
    const second = await useCase.execute({
      type: "skill",
      name: "tdd",
      repoPath: "/registered/repo",
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
        resolveLatestTag: async () => "v0.5.1",
        deploySkill: async () => {
          if (failFirst) {
            failFirst = false;
            throw new Error("apm exited 1");
          }
        },
      },
    });
    const useCase = new DeploySkill(deps);
    const input = {
      type: "skill",
      name: "tdd",
      repoPath: "/registered/repo",
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
        resolveLatestTag: async () => "v0.5.1",
        deploySkill: async () => {
          throw new Error("apm exited 1 with a token in stderr");
        },
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      repoPath: "/registered/repo",
    });

    expect(result).toEqual({ ok: false, error: "deploy-failed" });
  });

  it("turns an apm tag-resolution failure into a typed deploy-failed error", async () => {
    const { deps, deployed } = buildDeps({
      apm: {
        resolveLatestTag: async () => {
          throw new Error("apm view failed: no network");
        },
        deploySkill: async () => undefined,
      },
    });
    const result = await new DeploySkill(deps).execute({
      type: "skill",
      name: "tdd",
      repoPath: "/registered/repo",
    });

    expect(result).toEqual({ ok: false, error: "deploy-failed" });
    expect(deployed).toEqual([]);
  });
});
