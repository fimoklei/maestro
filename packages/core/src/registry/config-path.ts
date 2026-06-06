import { homedir } from "node:os";
import { join } from "node:path";

// Resolves the config file location. MAESTRO_HOME relocates the whole maestro
// directory (default ~/.maestro), so a smoke run or test can sandbox all state
// in a throwaway dir without touching real data.
export function resolveMaestroConfigPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const base = env.MAESTRO_HOME ?? join(homedir(), ".maestro");
  return join(base, "config.json");
}
