// Pushes one skill's removal to its promote branch. A deletion is never
// inferred from absence: it takes a confirmation (#580).
import { parseGitOrigin } from "../deploy/git-origin";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { type HarnessReviewPort, matchesProposal } from "./harness-review-port";
import {
  isPromotableSkillName,
  PROPOSAL_BODY,
  promoteBranch,
  promoteCompareUrl,
  proposalTitle,
} from "./promote-branch";
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
    if (!isPromotableSkillName(name)) {
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

    const facts = await this.deps.git.readFacts(root);
    const origin =
      facts.originUrl === null ? null : parseGitOrigin(facts.originUrl);
    if (origin === null) {
      return { ok: false, error: "no-usable-origin" };
    }
    const head = facts.defaultBranchCommit;
    const branch = facts.defaultBranch;
    if (head === null || branch === null) {
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

    // Read now, not from the cockpit: decides update versus open.
    const review = await this.deps.review.readReviews(origin);
    const open =
      review.outcome !== "read" || !review.complete
        ? null
        : review.requests.filter(
            (request) =>
              request.state === "open" &&
              matchesProposal(request, {
                ownerRepo: origin.ownerRepo,
                branch: promoteBranch(name),
                base: branch,
              }),
          );
    if (open !== null && open.length > 1) {
      return { ok: false, error: "extra-requests" };
    }

    const push = await this.deps.git.pushSkillDeletion(root, name, head);
    switch (push) {
      case "pushed":
        // Only when GitHub answered that the branch has no request.
        if (open !== null && open.length === 0) {
          await this.deps.review.createRequest(origin, {
            head: promoteBranch(name),
            base: branch,
            title: proposalTitle(name),
            body: PROPOSAL_BODY,
          });
        }
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
