// The version-drift use-case: take "is anything behind in repo Y" from the
// screen and answer it — gate the repo against the registry and canonicalize it
// before any apm access (a path-taking operation must reject an unregistered
// repo first, per security.md), then delegate the judgment to `apm outdated`
// via the driver port (ADR-0001; we never compute a version diff ourselves).
// The result is deliberately flat: { ok: true; behind } when the check ran, or
// { ok: false } when it could not — one failure, no taxonomy. The web layer
// maps { ok: false } to "unknown" so a failed check never reads as up-to-date.
import type { ApmDriverPort, DeployTarget } from "../deploy/deploy-skill";
import type { VersionDrift } from "./parse-outdated";

export type CheckVersionDriftInput = {
  target: DeployTarget;
};

export type CheckVersionDriftResult =
  | { ok: true; behind: VersionDrift[] }
  | { ok: false };

export class CheckVersionDrift {
  private readonly deps: {
    registry: { isRegistered(path: string): Promise<boolean> };
    apm: Pick<ApmDriverPort, "checkOutdated">;
    // Resolves a path to its canonical form (realpath), so apm runs against the
    // real repo and not a symlinked spelling of it.
    canonicalPath: (path: string) => Promise<string>;
  };

  constructor(deps: CheckVersionDrift["deps"]) {
    this.deps = deps;
  }

  async execute(
    input: CheckVersionDriftInput,
  ): Promise<CheckVersionDriftResult> {
    let target = input.target;
    if (target.kind === "repo") {
      // Registry gate first: refuse an unregistered repo before any apm access.
      if (!(await this.deps.registry.isRegistered(target.repoPath))) {
        return { ok: false };
      }
      // Registration guarantees the path exists, so canonicalizing only fails
      // on a genuinely broken environment — treated as a failed check.
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
