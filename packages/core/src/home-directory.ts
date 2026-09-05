import { homedir } from "node:os";
import { join } from "node:path";

export function resolveHomeDirectory(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.HOME ?? homedir();
}

// Maestro state has its own override; preserve the OS-home fallback.
export function resolveMaestroHome(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.MAESTRO_HOME ?? join(homedir(), ".maestro");
}
