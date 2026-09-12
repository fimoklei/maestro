// Shared test helper: a RemoveDeployedSkill whose apm port does nothing, for
// tests that exercise other routes but must satisfy createApp's remove
// dependency. Its ref lookup finds nothing, so a stray call refuses instead of
// pretending to have removed something.
import {
  type InFlightLocks,
  type Registry,
  RemoveDeployedSkill,
} from "@maestro/core";

export const stubRemove = (deps: {
  registry: Registry;
  // The same instance stubDeploy gets, as in realDeps.
  locks: InFlightLocks;
}) =>
  new RemoveDeployedSkill({
    registry: deps.registry,
    locks: deps.locks,
    deployedRef: {
      resolve: async () => ({ ok: false as const, reason: "not-deployed" }),
    },
    deployedContent: {
      classify: async () => "clean",
      contentDigest: async () => null,
    },
    apm: { removeSkill: async () => ({ ok: true as const }) },
    // Never reached: the ref lookup above refuses first, so nothing gets far
    // enough to reclaim a leftover.
    deployedCleanup: { removeSkillTargets: async () => undefined },
    // No tool detected: a stray global call refuses rather than claiming a scope
    // this stub never had.
    toolPresence: { detectGlobalTools: async () => [] },
    canonicalPath: async (path) => path,
    // Never reached either, for the same reason as deployedCleanup above.
    location: { treeRoot: () => "/home" },
  });
