// Decides which inventory clone the reader uses: the persisted config wins, and
// MAESTRO_INVENTORY_PATH is the fallback that seeds a fresh setup before the UI
// has saved a path. No persistence — the env is simply the bootstrap source
// (see issue J01). Undefined means "not configured".
import type { MaestroConfig } from "../registry/config-store";

export function resolveInventoryPath(
  config: MaestroConfig,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return config.inventoryPath ?? env.MAESTRO_INVENTORY_PATH;
}
