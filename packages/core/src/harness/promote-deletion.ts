// Pushes one primitive's removal to its proposal branch. A deletion is never
// inferred from absence: it takes a confirmation (#580).
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import type { HarnessFetchGate } from "./harness-fetch-gate";
import {
  type PrimitiveRef,
  proposalBranch,
  proposalCompareUrl,
} from "./harness-primitive";
import type { HarnessReviewPort } from "./harness-review-port";
import { beforeProposalPush, readOriginFacts } from "./proposal-request";
import type { HarnessGitPort, WorktreeAmbiguity } from "./read-harness-state";

export type PromoteDeletionError =
  | "not-configured"
  | "no-usable-origin"
  | "invalid-skill"
  | "no-answer"
  | "promote-in-progress"
  | "confirmation-stale"
  | "not-deleted"
  | WorktreeAmbiguity
  | "push-elsewhere"
  | "source-changed"
  | "extra-requests"
  | "proposed-by-other"
  | "promote-failed";

export type PromoteDeletionResult =
  | { ok: true; branch: string; pullRequestUrl: string }
  | { ok: false; error: PromoteDeletionError };

export class PromoteSkillDeletion {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: HarnessGitPort;
    fetchGate: Pick<HarnessFetchGate, "fetch" | "invalidate">;
    locks: InFlightLocks;
    review: HarnessReviewPort;
  };

  constructor(deps: PromoteSkillDeletion["deps"]) {
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
      this.remove(root, ref, seenRemoteTree),
    );
    return run.ok ? run.value : { ok: false, error: "promote-in-progress" };
  }

  private async remove(
    root: string,
    ref: PrimitiveRef,
    seenRemoteTree: string,
  ): Promise<PromoteDeletionResult> {
    const outcome = await this.deps.fetchGate.fetch(root, 0);
    if (outcome !== "fetched") {
      return { ok: false, error: "no-answer" };
    }

    const facts = await readOriginFacts(this.deps.git, root);
    if (!facts.ok) {
      return facts;
    }
    const { origin, base: branch, head } = facts;
    if (head === null) {
      return { ok: false, error: "no-answer" };
    }

    // First: an ambiguous working tree makes every fact below unreadable.
    const ambiguity = await this.deps.git.readWorktreeAmbiguity(root);
    if (ambiguity !== null) {
      return { ok: false, error: ambiguity };
    }

    // Re-read at the press, never taken from the row (#575).
    const local = await this.deps.git.readPrimitives(root, "HEAD");
    const trees = await this.deps.git.readMovementTrees(root);
    if (local === null || trees === null) {
      return { ok: false, error: "no-answer" };
    }
    if (
      !local.some(
        (object) => object.type === ref.type && object.name === ref.name,
      ) ||
      Object.hasOwn(trees[ref.type].working, ref.name)
    ) {
      return { ok: false, error: "not-deleted" };
    }

    // From the refs just fetched: the confirmed hash may be stale.
    const remoteObjects = await this.deps.git.readPrimitives(root, head);
    if (remoteObjects === null) {
      return { ok: false, error: "no-answer" };
    }
    const remote = remoteObjects.find(
      (object) => object.type === ref.type && object.name === ref.name,
    )?.hash;
    if (remote !== seenRemoteTree) {
      return { ok: false, error: "confirmation-stale" };
    }

    const request = await beforeProposalPush(
      this.deps.review,
      {
        origin,
        base: branch,
        ref,
      },
      "deletion",
    );
    if (!request.ok) {
      return request;
    }

    const push = await this.deps.git.pushDeletion(root, ref, head);
    switch (push) {
      case "pushed":
        // The new branch reaches the clone only through a fetch.
        this.deps.fetchGate.invalidate(root);
        await request.afterPush();
        return {
          ok: true,
          branch: proposalBranch(ref),
          pullRequestUrl: proposalCompareUrl(origin, branch, ref),
        };
      case "push-elsewhere":
        return { ok: false, error: "push-elsewhere" };
      case "source-changed":
        return { ok: false, error: "source-changed" };
      case "offline":
        return { ok: false, error: "no-answer" };
      case "push-failed":
        return { ok: false, error: "promote-failed" };
    }
  }
}
