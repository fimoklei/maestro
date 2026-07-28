// The version-drift use-case. The judgment is `apm outdated`'s — Maestro never
// computes a version diff itself (ADR-0001).
import type { ApmDriverPort, DeployTarget } from "../deploy/deploy-skill";
// Forwarded unchanged, so the outcome has one owner.
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
      // Before any apm access (security.md).
      if (!(await this.deps.registry.isRegistered(target.repoPath))) {
        return { ok: false };
      }
      // Registration guarantees the path exists, so this is the catch-all for a
      // broken environment.
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
