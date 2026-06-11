import { homedir } from "node:os";
import { join } from "node:path";

// Resolves apm's user-scope (global) metadata root, where its global
// apm.lock.yaml lives. apm derives this from the user's home (Path.home()), so
// it is HOME-redirectable: a test or smoke run points HOME at a sandbox and
// never reads or writes the real ~/.apm (see .claude/rules/apm-driver.md).
export function resolveApmGlobalRoot(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const base = env.HOME ?? homedir();
  return join(base, ".apm");
}
