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

export function resolveMaestroConfigPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(resolveMaestroHome(env), "config.json");
}

// apm edits the cwd's .gitignore even for -g, so a global deploy must run from
// a scratch dir, never a real repo.
export function resolveApmScratchCwd(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(resolveMaestroHome(env), ".apm-scratch");
}

// Derived from HOME, as apm does, so a test or smoke run never touches ~/.apm.
export function resolveApmGlobalRoot(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return join(resolveHomeDirectory(env), ".apm");
}
