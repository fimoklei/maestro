// Shared test helper: a DeploySkill whose apm port does nothing, for tests
// that exercise other routes but must satisfy createApp's deploy dependency.
import {
  DeploySkill,
  type InFlightLocks,
  type InventoryReader,
  type Registry,
} from "@maestro/core";

export const stubDeploy = (deps: {
  inventory: InventoryReader;
  registry: Registry;
  // The same instance stubRemove gets: both rewrite one apm.lock.yaml, as they
  // do in realDeps.
  locks: InFlightLocks;
}) =>
  new DeploySkill({
    inventory: deps.inventory,
    registry: deps.registry,
    locks: deps.locks,
    apm: {
      resolveLatestTag: async () => ({ ok: false, reason: "no-tag" }),
      deploySkill: async () => ({ ok: true as const }),
    },
    recordedPackage: { read: async () => null },
    inventoryGit: {
      skillExistsAtTag: async () => false,
      skillDivergesFromTag: async () => false,
    },
    deployedContent: { classify: async () => "not-deployed" },
    deployedCleanup: { removeSkillTargets: async () => undefined },
    toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
    inventoryOriginUrl: async () => null,
    canonicalPath: async (path) => path,
  });
