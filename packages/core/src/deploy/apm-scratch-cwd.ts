import { homedir } from "node:os";
import { join } from "node:path";

// apm edits the cwd's .gitignore even for -g, so a global deploy must run from
// a scratch dir, never a real repo (apm-driver.md § Invocation). Under
// MAESTRO_HOME, so the same env override sandboxes it.
export function resolveApmScratchCwd(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const base = env.MAESTRO_HOME ?? join(homedir(), ".maestro");
  return join(base, ".apm-scratch");
}
