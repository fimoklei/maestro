// Shared test helper: a RemoveDeployedSkill whose apm port does nothing, for
// tests that exercise other routes but must satisfy createApp's remove
// dependency. Its ref lookup finds nothing, so a stray call refuses instead of
// pretending to have removed something.
import { type Registry, RemoveDeployedSkill } from "@maestro/core";

export const stubRemove = (deps: { registry: Registry }) =>
  new RemoveDeployedSkill({
    registry: deps.registry,
    deployedRef: {
      resolve: async () => ({ ok: false as const, reason: "not-deployed" }),
    },
    deployedContent: { classify: async () => "clean" },
    apm: { removeSkill: async () => ({ ok: true as const }) },
    // No tool detected: a stray global call refuses rather than claiming a scope
    // this stub never had.
    toolPresence: { detectGlobalTools: async () => [] },
    canonicalPath: async (path) => path,
  });
