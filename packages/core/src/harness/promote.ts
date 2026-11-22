import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import type { HarnessFetchGate } from "./harness-fetch-gate";
import type { PrimitiveRef } from "./harness-primitive";
import type { PrimitiveEntryFs } from "./harness-primitive-dir";
import type { HarnessReviewPort } from "./harness-review-port";
import { type ProposeChangeError, proposeChange } from "./propose-item";
import type { HarnessGitPort } from "./read-harness-state";

export type PromoteError =
  | "not-configured"
  | "invalid-skill"
  | "promote-in-progress"
  | ProposeChangeError;

export type PromoteResult =
  | { ok: true; branch: string; pullRequestUrl: string }
  | { ok: false; error: PromoteError };

export class Promote {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: PrimitiveEntryFs;
    git: HarnessGitPort;
    fetchGate: Pick<HarnessFetchGate, "fetchFresh" | "invalidate">;
    locks: InFlightLocks;
    review: HarnessReviewPort;
  };

  constructor(deps: Promote["deps"]) {
    this.deps = deps;
  }

  async execute(ref: PrimitiveRef): Promise<PromoteResult> {
    if (!isValidSkillSlug(ref.name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }

    const run = await this.deps.locks.run(root, () =>
      proposeChange(this.deps, root, ref),
    );
    if (!run.ok) {
      return { ok: false, error: "promote-in-progress" };
    }
    const result = run.value;
    return result.ok
      ? {
          ok: true,
          branch: result.branch,
          pullRequestUrl: result.pullRequestUrl,
        }
      : result;
  }
}
