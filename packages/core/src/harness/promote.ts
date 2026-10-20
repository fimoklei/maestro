// Pushes one primitive's working-tree content to its own branch, built on the
// fetched default-branch tip. The author's repository state is never touched.
import type { GitOrigin } from "../deploy/git-origin";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import type { HarnessFetchGate } from "./harness-fetch-gate";
import {
  type HarnessObject,
  type PrimitiveRef,
  proposalBranch,
  proposalCompareUrl,
} from "./harness-primitive";
import type { HarnessReviewPort } from "./harness-review-port";
import { isConcurrentlyChanged } from "./harness-stages";
import {
  beforeProposalPush,
  type ProposalKind,
  readOriginFacts,
} from "./proposal-request";
import type { HarnessGitPort } from "./read-harness-state";

export type PromoteError =
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
  | "proposed-by-other"
  | "promote-failed"
  | "promote-in-progress";

export type PromoteResult =
  | { ok: true; branch: string; pullRequestUrl: string }
  | { ok: false; error: PromoteError };

type Checked =
  | {
      ok: true;
      origin: GitOrigin;
      head: string;
      base: string;
      kind: Exclude<ProposalKind, "deletion">;
    }
  | { ok: false; error: PromoteError };

export class Promote {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: HarnessGitPort;
    fetchGate: Pick<HarnessFetchGate, "fetch" | "invalidate">;
    locks: InFlightLocks;
    review: HarnessReviewPort;
  };

  constructor(deps: Promote["deps"]) {
    this.deps = deps;
  }

  // One promotion per harness at a time.
  async execute(ref: PrimitiveRef): Promise<PromoteResult> {
    if (!isValidSkillSlug(ref.name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }

    const run = await this.deps.locks.run(root, () => this.promote(root, ref));
    return run.ok ? run.value : { ok: false, error: "promote-in-progress" };
  }

  private async promote(
    root: string,
    ref: PrimitiveRef,
  ): Promise<PromoteResult> {
    const outcome = await this.deps.fetchGate.fetch(root, 0);
    if (outcome !== "fetched") {
      return { ok: false, error: "no-answer" };
    }
    const first = await this.checkNotConcurrent(root, ref);
    if (!first.ok) {
      return first;
    }

    // Re-fetched and rechecked right before the push, so a teammate's change
    // cannot slip through the gap (#579).
    const refetched = await this.deps.fetchGate.fetch(root, 0);
    if (refetched !== "fetched") {
      return { ok: false, error: "no-answer" };
    }
    const second = await this.checkNotConcurrent(root, ref);
    if (!second.ok) {
      return second;
    }

    const request = await beforeProposalPush(
      this.deps.review,
      {
        origin: second.origin,
        base: second.base,
        ref,
      },
      second.kind,
    );
    if (!request.ok) {
      return request;
    }

    const push = await this.deps.git.pushPromotion(
      root,
      ref,
      second.head,
      second.kind,
    );
    switch (push) {
      case "pushed":
        // The new branch reaches the clone only through a fetch.
        this.deps.fetchGate.invalidate(root);
        await request.afterPush();
        return {
          ok: true,
          branch: proposalBranch(ref),
          pullRequestUrl: proposalCompareUrl(second.origin, second.base, ref),
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

  // Scoped to this primitive via the merge base: unrelated commits never block (#579).
  private async checkNotConcurrent(
    root: string,
    ref: PrimitiveRef,
  ): Promise<Checked> {
    const facts = await readOriginFacts(this.deps.git, root);
    if (!facts.ok) {
      return facts;
    }
    const { origin, base, head } = facts;
    if (head === null) {
      return { ok: false, error: "no-answer" };
    }

    const mergeBase = await this.deps.git.mergeBaseCommit(root, head);
    const [remote, local, atMergeBase] = await Promise.all([
      this.deps.git.readPrimitives(root, head),
      this.deps.git.readPrimitives(root, "HEAD"),
      mergeBase === null
        ? Promise.resolve(null)
        : this.deps.git.readPrimitives(root, mergeBase),
    ]);
    if (remote === null || local === null) {
      return { ok: false, error: "no-answer" };
    }
    const concurrentChange = isConcurrentlyChanged(
      { remote: hashOf(remote, ref), local: hashOf(local, ref) },
      atMergeBase === null ? undefined : hashOf(atMergeBase, ref),
    );
    if (concurrentChange) {
      return { ok: false, error: "concurrent-change" };
    }
    const kind = hashOf(remote, ref) === null ? "addition" : "edit";
    return { ok: true, origin, head, base, kind };
  }
}

const hashOf = (objects: HarnessObject[], ref: PrimitiveRef): string | null =>
  objects.find((object) => object.type === ref.type && object.name === ref.name)
    ?.hash ?? null;
