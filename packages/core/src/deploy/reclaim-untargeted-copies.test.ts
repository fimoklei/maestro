import { describe, expect, it } from "vitest";
import type { DeployTarget } from "./deploy-skill";
import type { SupportedTool } from "./deploy-tools";
import { reclaimUntargetedCopies } from "./reclaim-untargeted-copies";

const GLOBAL: DeployTarget = { kind: "global" };

function spyCleanup(options: { throws?: boolean } = {}) {
  const calls: { name: string; tools: readonly SupportedTool[] }[] = [];
  return {
    calls,
    port: {
      removeSkillTargets: async (input: {
        name: string;
        tools: readonly SupportedTool[];
      }) => {
        calls.push({ name: input.name, tools: input.tools });
        if (options.throws) {
          throw new Error("permission denied");
        }
      },
    },
  };
}

describe("reclaimUntargetedCopies", () => {
  it("reclaims the subtree of a tool that owns its skills directory and is gone", async () => {
    const { calls, port } = spyCleanup();

    await reclaimUntargetedCopies({
      cleanup: port,
      target: GLOBAL,
      name: "tdd",
      detected: ["codex"],
    });

    expect(calls).toEqual([{ name: "tdd", tools: ["claude"] }]);
  });

  it("keeps a directory several tools read, even when its tool is gone", async () => {
    const { calls, port } = spyCleanup();

    await reclaimUntargetedCopies({
      cleanup: port,
      target: GLOBAL,
      name: "tdd",
      detected: ["claude"],
    });

    expect(calls).toEqual([]);
  });

  it("reclaims nothing on the per-repo path", async () => {
    // A repo's targets are its own apm.yml, so this machine's detection says
    // nothing about what its tree should hold.
    const { calls, port } = spyCleanup();

    await reclaimUntargetedCopies({
      cleanup: port,
      target: { kind: "repo", repoPath: "/repo" },
      name: "tdd",
      detected: undefined,
    });

    expect(calls).toEqual([]);
  });

  it("swallows a reclaim that fails, so the caller's success stands", async () => {
    const { port } = spyCleanup({ throws: true });

    await expect(
      reclaimUntargetedCopies({
        cleanup: port,
        target: GLOBAL,
        name: "tdd",
        detected: ["codex"],
      }),
    ).resolves.toBeUndefined();
  });
});
