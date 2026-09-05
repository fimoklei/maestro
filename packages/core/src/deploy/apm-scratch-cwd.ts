import { join } from "node:path";
import { resolveMaestroHome } from "../home-directory";

// apm edits the cwd's .gitignore even for -g, so a global deploy must run from
// a scratch dir, never a real repo (apm-driver.md § Invocation). Under
// MAESTRO_HOME, so the same env override sandboxes it.
export function resolveApmScratchCwd(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const base = resolveMaestroHome(env);
  return join(base, ".apm-scratch");
}
