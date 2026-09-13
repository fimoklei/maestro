import { join } from "node:path";
import { resolveApmGlobalRoot } from "../deploy-state/resolve-apm-global-root";
import { resolveHomeDirectory } from "../home-directory";
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
      : resolveHomeDirectory(this.env);
  }

  lockfilePath(target: DeployTarget): string {
    return this.apmRoot(target, "apm.lock.yaml");
  }

  // The consumer's apm.yml, which holds the Selection apm installs from
  // (ADR-0031). It sits beside the lockfile in both scopes.
  manifestPath(target: DeployTarget): string {
    return this.apmRoot(target, "apm.yml");
  }

  private apmRoot(target: DeployTarget, file: string): string {
    return target.kind === "repo"
      ? join(target.repoPath, file)
      : join(resolveApmGlobalRoot(this.env), file);
  }
}
