import { homedir } from "node:os";
import { join } from "node:path";
import { resolveApmGlobalRoot } from "../deploy-state/resolve-apm-global-root";
import type { DeployTarget } from "./deploy-skill";

// A global install splits lockfile from tree: apm writes the lockfile under
// ~/.apm but keys deployed_file_hashes HOME-relative (apm-behavior.md § Global
// scope). One shared instance, so guard and cleanup agree on the tree.
export class DeployedLocation {
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  // What deployed_file_hashes keys are relative to. Per-repo: the repo. Global:
  // HOME, read from `env` so a sandbox can redirect it.
  treeRoot(target: DeployTarget): string {
    return target.kind === "repo"
      ? target.repoPath
      : (this.env.HOME ?? homedir());
  }

  lockfilePath(target: DeployTarget): string {
    return target.kind === "repo"
      ? join(target.repoPath, "apm.lock.yaml")
      : join(resolveApmGlobalRoot(this.env), "apm.lock.yaml");
  }
}
