// `apm outdated` per Target, reused for a short window. Every apm write passes
// through here, so a write drops the answer it changed.
import type { ApmDriverPort, DeployTarget } from "../deploy/deploy-skill";
import { ReuseGate } from "../reuse-gate";
import type { OutdatedResult } from "./parse-outdated";

const keyOf = (target: DeployTarget) =>
  target.kind === "repo" ? `repo:${target.repoPath}` : "global";

export class ReusedOutdated implements ApmDriverPort {
  private readonly deps: {
    apm: ApmDriverPort;
    // A write may name a symlinked spelling; reads arrive canonical.
    canonicalPath: (path: string) => Promise<string>;
    now: () => Date;
    maxAgeMs: number;
  };
  private readonly gate: ReuseGate<OutdatedResult>;

  constructor(deps: ReusedOutdated["deps"]) {
    this.deps = deps;
    this.gate = new ReuseGate({ now: deps.now, keep: (result) => result.ok });
  }

  resolveLatestTag(ownerRepo: string) {
    return this.deps.apm.resolveLatestTag(ownerRepo);
  }

  async deploySkill(input: Parameters<ApmDriverPort["deploySkill"]>[0]) {
    try {
      return await this.deps.apm.deploySkill(input);
    } finally {
      await this.drop(input.target);
    }
  }

  async removeSkill(input: Parameters<ApmDriverPort["removeSkill"]>[0]) {
    try {
      return await this.deps.apm.removeSkill(input);
    } finally {
      await this.drop(input.target);
    }
  }

  checkOutdated(target: DeployTarget): Promise<OutdatedResult> {
    return this.gate.run(keyOf(target), this.deps.maxAgeMs, () =>
      this.deps.apm.checkOutdated(target),
    );
  }

  // A new release changes what Behind means for every Target.
  dropAll(): void {
    this.gate.invalidateAll();
  }

  private async drop(target: DeployTarget): Promise<void> {
    if (target.kind === "global") {
      this.gate.invalidate(keyOf(target));
      return;
    }
    try {
      const repoPath = await this.deps.canonicalPath(target.repoPath);
      this.gate.invalidate(keyOf({ kind: "repo", repoPath }));
    } catch {
      this.dropAll();
    }
  }
}
