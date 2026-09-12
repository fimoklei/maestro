// Shared test helper: a DeploySkill whose apm port does nothing, for tests
// that exercise other routes but must satisfy createApp's deploy dependency.
import {
  ConfigStore,
  DeployedLocation,
  DeploySkill,
  type InFlightLocks,
  type InventoryReader,
  type Registry,
  RetryTargetOperation,
  SelectionWriter,
  TargetOperationStore,
} from "@maestro/core";

// A Selection writer that reads nothing and writes nothing: the routes these
// stubs serve never reach it.
export const stubSelectionWriter = () =>
  new SelectionWriter({
    fs: {
      readFile: async () => null,
      writeFile: async () => undefined,
      isFileEntry: async () => false,
    },
    location: new DeployedLocation(process.env),
    apm: {
      deploySkill: async () => ({ ok: true as const }),
      removeSkill: async () => ({ ok: true as const }),
    },
    operations: new TargetOperationStore({
      store: new ConfigStore({
        fs: {
          readFile: async () => null,
          writeFile: async () => undefined,
        } as never,
        configPath: () => "/dev/null/config.json",
      }),
    }),
  });

// A retry use-case with no operation record to find, for tests that exercise
// other routes but must satisfy createApp's dependency.
export const stubRetryOperation = (deps: {
  registry: Registry;
  locks: InFlightLocks;
}) =>
  new RetryTargetOperation({
    registry: deps.registry,
    selection: stubSelectionWriter(),
    deployedContent: { classify: async () => "not-deployed" },
    toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
    canonicalPath: async (path) => path,
    locks: deps.locks,
  });

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
    recordedPackage: {
      read: async () => ({
        kind: "recorded" as const,
        reading: { kind: "skill" as const, name: "tdd" },
      }),
    },
    inventoryGit: {
      syncBeforeDeploy: async () => {},
      skillExistsAtTag: async () => false,
      skillDivergesFromTag: async () => false,
      readSkillFilesAtTag: async () => null,
    },
    deployedContent: {
      classify: async () => "not-deployed",
      linkedSkillPath: async () => null,
    },
    deployedCleanup: { removeSkillTargets: async () => undefined },
    toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
    inventoryOriginUrl: async () => null,
    canonicalPath: async (path) => path,
    selection: stubSelectionWriter(),
  });
