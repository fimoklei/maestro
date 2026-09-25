// A RemoveDeployedSkill whose ref lookup finds nothing, so a stray call
// refuses instead of pretending to remove something.
import {
  type InFlightLocks,
  type Registry,
  RemoveDeployedSkill,
} from "@maestro/core";

export const stubRemove = (deps: {
  registry: Registry;
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
    deployedCleanup: { removeSkillTargets: async () => undefined },
    toolPresence: { detectGlobalTools: async () => [] },
    canonicalPath: async (path) => path,
    location: { treeRoot: () => "/home" },
  });
