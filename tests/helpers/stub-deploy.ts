// Shared test helper: a DeploySkill whose apm port does nothing, for tests
// that exercise other routes but must satisfy createApp's deploy dependency.
import {
  DeploySkill,
  type InventoryReader,
  type Registry,
} from "@maestro/core";

export const stubDeploy = (deps: {
  inventory: InventoryReader;
  registry: Registry;
}) =>
  new DeploySkill({
    inventory: deps.inventory,
    registry: deps.registry,
    apm: {
      resolveLatestTag: async () => null,
      deploySkill: async () => undefined,
    },
    inventoryOriginUrl: async () => null,
  });
