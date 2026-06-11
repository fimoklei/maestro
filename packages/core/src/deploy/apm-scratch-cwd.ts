import { homedir } from "node:os";
import { join } from "node:path";

// Resolves the neutral working directory for a global `apm install -g`. apm
// appends apm_modules/ to the cwd's .gitignore even for -g, so global deploys
// must run from a scratch dir, never a real repo. It sits under MAESTRO_HOME
// (default ~/.maestro), so it is sandboxed by the same env override as the rest
// of Maestro's state (apm-driver.md, J07).
export function resolveApmScratchCwd(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const base = env.MAESTRO_HOME ?? join(homedir(), ".maestro");
  return join(base, ".apm-scratch");
}
