import { homedir } from "node:os";
import { join } from "node:path";
import { resolveApmGlobalRoot } from "../deploy-state/resolve-apm-global-root";
import type { DeployTarget } from "./deploy-skill";

// Where a deployed copy physically lands, per target. A repo keeps its lockfile
// and its deployed tree together in the repo; a global install splits them — apm
// writes the lockfile under ~/.apm but materializes the skill under HOME
// (~/.claude/skills, ~/.agents/skills) and keys deployed_file_hashes
// HOME-relative (verified against apm 0.20.0, apm-driver.md #61). Resolving the
// tree root to HOME is what lets those keys match a live sha256, so a clean
// global skill classifies clean rather than being falsely refused.
//
// One instance is shared by the destination guard (which needs both the tree and
// the lockfile) and the reconciling cleanup (which needs only the tree), so their
// agreement on the tree is a shared object, not a comment. env is captured at
// construction so a test or smoke run can redirect HOME at a sandbox and never
// touch the real home.
export class DeployedLocation {
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  // The root the deployed_file_hashes keys are relative to, and the tree the
  // cleanup rm's under. Per-repo: the repo. Global: HOME.
  treeRoot(target: DeployTarget): string {
    return target.kind === "repo"
      ? target.repoPath
      : (this.env.HOME ?? homedir());
  }

  // Where the target's apm.lock.yaml lives. Per-repo: <repoPath>/apm.lock.yaml.
  // Global: <apmGlobalRoot>/apm.lock.yaml (~/.apm).
  lockfilePath(target: DeployTarget): string {
    return target.kind === "repo"
      ? join(target.repoPath, "apm.lock.yaml")
      : join(resolveApmGlobalRoot(this.env), "apm.lock.yaml");
  }
}
