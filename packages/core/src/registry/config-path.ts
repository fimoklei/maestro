import { join } from "node:path";
import { resolveMaestroHome } from "../home-directory";

// MAESTRO_HOME relocates the whole maestro directory, so a smoke run or test
// can sandbox all state in a throwaway dir (ADR-0010).
export function resolveMaestroConfigPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const base = resolveMaestroHome(env);
  return join(base, "config.json");
}
