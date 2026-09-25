import { join } from "node:path";
import { resolveApmGlobalRoot } from "../deploy-state/resolve-apm-global-root";
import { resolveHomeDirectory } from "../home-directory";
import type { DeployTarget } from "./deploy-skill";

// A global install splits lockfile from tree: the lockfile lives under ~/.apm
// but deployed_file_hashes keys are HOME-relative.
export class DeployedLocation {
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  /** What deployed_file_hashes keys are relative to. */
  treeRoot(target: DeployTarget): string {
    return target.kind === "repo"
      ? target.repoPath
      : resolveHomeDirectory(this.env);
  }

  lockfilePath(target: DeployTarget): string {
    return this.apmRoot(target, "apm.lock.yaml");
  }

  manifestPath(target: DeployTarget): string {
    return this.apmRoot(target, "apm.yml");
  }

  private apmRoot(target: DeployTarget, file: string): string {
    return target.kind === "repo"
      ? join(target.repoPath, file)
      : join(resolveApmGlobalRoot(this.env), file);
  }
}
