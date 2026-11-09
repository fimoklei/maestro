// Proposes one primitive's removal on its proposal branch. A deletion is never
// inferred from absence: it takes a confirmation (#580).
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import type { HarnessFetchGate } from "./harness-fetch-gate";
import type { PrimitiveRef } from "./harness-primitive";
import type { HarnessReviewPort } from "./harness-review-port";
import { type ProposeDeletionError, proposeDeletion } from "./propose-item";
import type { HarnessGitPort } from "./read-harness-state";

export type PromoteDeletionError =
  | "not-configured"
  | "invalid-skill"
  | "promote-in-progress"
  | ProposeDeletionError;

export type PromoteDeletionResult =
  | { ok: true; branch: string; pullRequestUrl: string }
  | { ok: false; error: PromoteDeletionError };

export class PromoteDeletion {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: HarnessGitPort;
    fetchGate: Pick<HarnessFetchGate, "fetchFresh" | "invalidate">;
    locks: InFlightLocks;
    review: HarnessReviewPort;
  };

  constructor(deps: PromoteDeletion["deps"]) {
    this.deps = deps;
  }

  // Shares the promotion lock, keyed by harness root.
  async execute(
    ref: PrimitiveRef,
    seenRemoteTree: string,
  ): Promise<PromoteDeletionResult> {
    if (!isValidSkillSlug(ref.name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }

    const run = await this.deps.locks.run(root, () =>
      proposeDeletion(this.deps, root, ref, seenRemoteTree),
    );
    if (!run.ok) {
      return { ok: false, error: "promote-in-progress" };
    }
    // The single proposal does not report its pull request's outcome.
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
