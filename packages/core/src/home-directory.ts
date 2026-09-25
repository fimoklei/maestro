import { homedir } from "node:os";
import { join } from "node:path";

export function resolveHomeDirectory(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.HOME ?? homedir();
}

export function resolveMaestroHome(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.MAESTRO_HOME ?? join(homedir(), ".maestro");
}
