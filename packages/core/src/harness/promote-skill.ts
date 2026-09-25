// Pushes one skill's working-tree content to its own branch, built on the
// fetched default-branch tip. The author's repository state is never touched.
import { parseGitOrigin } from "../deploy/git-origin";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isConcurrentlyChanged } from "./classify-movement";
import {
  type HarnessReviewPort,
  matchesProposal,
  type ReviewRequest,
} from "./harness-review-port";
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
} from "./read-harness-state";
import { recordFetch } from "./record-fetch";

export type PromoteSkillError =
  | "not-configured"
  | "no-usable-origin"
  | "invalid-skill"
  | "no-answer"
  | "skill-missing"
  | "push-elsewhere"
  | "source-changed"
  // Recomputed after a fresh fetch, never from what the cockpit showed (#579).
  | "concurrent-change"
  | "extra-requests"
  | "promote-failed"
  | "promote-in-progress";

export type PromoteSkillResult =
  | { ok: true; branch: string; pullRequestUrl: string }
  | { ok: false; error: PromoteSkillError };

type Checked =
  | {
      ok: true;
      origin: NonNullable<ReturnType<typeof parseGitOrigin>>;
      head: string;
      base: string;
      branch: string;
    }
  | { ok: false; error: PromoteSkillError };

export class PromoteSkill {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: HarnessGitPort;
    freshness: HarnessFreshnessPort;
    locks: InFlightLocks;
    review: HarnessReviewPort;
  };

  constructor(deps: PromoteSkill["deps"]) {
    this.deps = deps;
  }

  // One promotion per harness at a time.
  async execute(name: string, at: Date): Promise<PromoteSkillResult> {
    if (!isPromotableSkillName(name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }

    const run = await this.deps.locks.run(root, () =>
      this.promote(root, name, at),
    );
    return run.ok ? run.value : { ok: false, error: "promote-in-progress" };
  }

  private async promote(
    root: string,
    name: string,
    at: Date,
  ): Promise<PromoteSkillResult> {
    const outcome = await recordFetch(this.deps, root, at);
    if (outcome !== "fetched") {
      return { ok: false, error: "no-answer" };
    }
    const first = await this.checkNotConcurrent(root, name);
    if (!first.ok) {
      return first;
    }

    // Re-fetched and rechecked right before the push, so a teammate's change
    // cannot slip through the gap (#579).
    const refetched = await this.deps.git.fetch(root);
    if (refetched !== "fetched") {
      return { ok: false, error: "no-answer" };
    }
    const second = await this.checkNotConcurrent(root, name);
    if (!second.ok) {
      return second;
    }

    // Read now, not from the cockpit: decides update versus open.
    const open = await this.openRequests(second);
    if (open !== null && open.length > 1) {
      return { ok: false, error: "extra-requests" };
    }

    const push = await this.deps.git.pushSkillPromotion(
      root,
      name,
      second.head,
    );
    switch (push) {
      case "pushed":
        // Only when GitHub answered that the branch has no request; unknown opens none.
        if (open !== null && open.length === 0) {
          await this.deps.review.createRequest(second.origin, {
            head: second.branch,
            base: second.base,
            title: proposalTitle(name),
            body: PROPOSAL_BODY,
          });
        }
        return {
          ok: true,
          branch: promoteBranch(name),
          pullRequestUrl: promoteCompareUrl(second.origin, second.base, name),
        };
      case "skill-missing":
        return { ok: false, error: "skill-missing" };
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

  // Scoped to this skill via the merge base: unrelated commits never block (#579).
  private async checkNotConcurrent(
    root: string,
    name: string,
  ): Promise<Checked> {
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

    const mergeBase = await this.deps.git.mergeBaseCommit(root, head);
    const [remoteTrees, localTrees, mergeBaseTrees] = await Promise.all([
      this.deps.git.readSkillTrees(root, head),
      this.deps.git.readSkillTrees(root, "HEAD"),
      mergeBase === null
        ? Promise.resolve(null)
        : this.deps.git.readSkillTrees(root, mergeBase),
    ]);
    if (remoteTrees === null || localTrees === null) {
      return { ok: false, error: "no-answer" };
    }
    const concurrentChange = isConcurrentlyChanged(
      {
        remote:
          remoteTrees.find((tree) => tree.name === name)?.treeHash ?? null,
        promote: null,
        local: localTrees.find((tree) => tree.name === name)?.treeHash ?? null,
        working: null,
      },
      mergeBaseTrees === null
        ? undefined
        : (mergeBaseTrees.find((tree) => tree.name === name)?.treeHash ?? null),
    );
    if (concurrentChange) {
      return { ok: false, error: "concurrent-change" };
    }
    return {
      ok: true,
      origin,
      head,
      base: branch,
      branch: promoteBranch(name),
    };
  }

  // Null is "unknown", never "none"; it blocks no push.
  private async openRequests(
    checked: Extract<Checked, { ok: true }>,
  ): Promise<ReviewRequest[] | null> {
    const review = await this.deps.review.readReviews(checked.origin);
    if (review.outcome !== "read" || !review.complete) {
      return null;
    }
    return review.requests.filter(
      (request) =>
        request.state === "open" &&
        matchesProposal(request, {
          ownerRepo: checked.origin.ownerRepo,
          branch: checked.branch,
          base: checked.base,
        }),
    );
  }
}
