import { join } from "node:path";
import { resolveHomeDirectory } from "../home-directory";

// Derived from HOME, as apm does, so a test or smoke run never touches ~/.apm.
export function resolveApmGlobalRoot(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const base = resolveHomeDirectory(env);
  return join(base, ".apm");
}
