// The judgment is `apm outdated`'s; Maestro never computes a version diff.
import type { ApmDriverPort, DeployTarget } from "../deploy/deploy-skill";
import type { OutdatedResult } from "./parse-outdated";

type CheckVersionDriftInput = {
  target: DeployTarget;
};

export class CheckVersionDrift {
  private readonly deps: {
    registry: { isRegistered(path: string): Promise<boolean> };
    apm: Pick<ApmDriverPort, "checkOutdated">;
    // realpath, so apm runs against the real repo, not a symlinked spelling.
    canonicalPath: (path: string) => Promise<string>;
  };

  constructor(deps: CheckVersionDrift["deps"]) {
    this.deps = deps;
  }

  async execute(input: CheckVersionDriftInput): Promise<OutdatedResult> {
    let target = input.target;
    if (target.kind === "repo") {
      // Before any apm access.
      if (!(await this.deps.registry.isRegistered(target.repoPath))) {
        return { ok: false };
      }
      try {
        target = {
          kind: "repo",
          repoPath: await this.deps.canonicalPath(target.repoPath),
        };
      } catch {
        return { ok: false };
      }
    }

    return this.deps.apm.checkOutdated(target);
  }
}
