import { homedir } from "node:os";
import { join } from "node:path";
import { resolveApmGlobalRoot } from "../deploy-state/resolve-apm-global-root";
import type { DeployTarget } from "./deploy-skill";

// The two roots the destination guard needs per target. A repo keeps its
// lockfile and its deployed tree together in the repo; a global install splits
// them — apm writes the lockfile under ~/.apm but materializes the skill under
// HOME (~/.claude/skills, ~/.agents/skills) and keys deployed_file_hashes
// HOME-relative (verified against apm 0.20.0, apm-driver.md #61). Resolving the
// deployed root to HOME is what lets those keys match a live sha256, so a clean
// global skill classifies clean rather than being falsely refused.
//
// Both take env so a test or smoke run can redirect HOME at a sandbox and never
// touch the real home.

export function resolveDeployedRoot(
  target: DeployTarget,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return target.kind === "repo" ? target.repoPath : (env.HOME ?? homedir());
}

export function resolveDeployedLockfilePath(
  target: DeployTarget,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return target.kind === "repo"
    ? join(target.repoPath, "apm.lock.yaml")
    : join(resolveApmGlobalRoot(env), "apm.lock.yaml");
}
