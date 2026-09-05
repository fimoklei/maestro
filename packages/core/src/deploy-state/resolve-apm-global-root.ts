import { join } from "node:path";
import { resolveHomeDirectory } from "../home-directory";

// apm derives this from the user's home, so it is HOME-redirectable: a test or
// smoke run never touches the real ~/.apm (apm-behavior.md § Global scope).
export function resolveApmGlobalRoot(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const base = resolveHomeDirectory(env);
  return join(base, ".apm");
}
