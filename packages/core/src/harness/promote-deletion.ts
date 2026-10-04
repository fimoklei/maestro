// Pushes one skill's removal to its promote branch. A deletion is never
// inferred from absence: it takes a confirmation (#580).
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import type { HarnessReviewPort } from "./harness-review-port";
import { promoteBranch, promoteCompareUrl } from "./promote-branch";
import { beforeProposalPush, readOriginFacts } from "./proposal-request";
import type {
  HarnessFreshnessPort,
  HarnessGitPort,
  WorktreeAmbiguity,
} from "./read-harness-state";
import { recordFetch } from "./record-fetch";

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
  | "promote-failed";

export type PromoteDeletionResult =
  | { ok: true; branch: string; pullRequestUrl: string }
  | { ok: false; error: PromoteDeletionError };

export class PromoteSkillDeletion {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: HarnessGitPort;
    freshness: HarnessFreshnessPort;
    locks: InFlightLocks;
    review: HarnessReviewPort;
  };

  constructor(deps: PromoteSkillDeletion["deps"]) {
    this.deps = deps;
  }

  // Shares the promotion lock, keyed by harness root.
  async execute(
    name: string,
    seenRemoteTree: string,
    at: Date,
  ): Promise<PromoteDeletionResult> {
    if (!isValidSkillSlug(name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }

    const run = await this.deps.locks.run(root, () =>
      this.remove(root, name, seenRemoteTree, at),
    );
    return run.ok ? run.value : { ok: false, error: "promote-in-progress" };
  }

  private async remove(
    root: string,
    name: string,
    seenRemoteTree: string,
    at: Date,
  ): Promise<PromoteDeletionResult> {
    const outcome = await recordFetch(this.deps, root, at);
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
    const localTrees = await this.deps.git.readSkillTrees(root, "HEAD");
    const trees = await this.deps.git.readMovementTrees(root);
    if (localTrees === null || trees === null) {
      return { ok: false, error: "no-answer" };
    }
    if (
      !localTrees.some((tree) => tree.name === name) ||
      Object.hasOwn(trees.working, name)
    ) {
      return { ok: false, error: "not-deleted" };
    }

    // From the refs just fetched: the confirmed hash may be stale.
    const remoteTrees = await this.deps.git.readSkillTrees(root, head);
    if (remoteTrees === null) {
      return { ok: false, error: "no-answer" };
    }
    const remote = remoteTrees.find((tree) => tree.name === name)?.treeHash;
    if (remote !== seenRemoteTree) {
      return { ok: false, error: "confirmation-stale" };
    }

    const request = await beforeProposalPush(this.deps.review, {
      origin,
      base: branch,
      name,
    });
    if (!request.ok) {
      return request;
    }

    const push = await this.deps.git.pushSkillDeletion(root, name, head);
    switch (push) {
      case "pushed":
        await request.afterPush();
        return {
          ok: true,
          branch: promoteBranch(name),
          pullRequestUrl: promoteCompareUrl(origin, branch, name),
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
