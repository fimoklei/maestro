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

  it("reports when no deployable tag exists", async () => {
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

    expect(result).toEqual({ ok: false, error: "no-deployable-tag" });
    expect(deployed).toEqual([]);
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
