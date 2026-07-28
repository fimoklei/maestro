// Config wins; the env var only bootstraps a fresh setup and is never
// persisted. Undefined means "not configured".
import type { MaestroConfig } from "../registry/config-store";

export function resolveInventoryPath(
  config: MaestroConfig,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return config.inventoryPath ?? env.MAESTRO_INVENTORY_PATH;
}
