// Pushes one skill's working-tree content to its own branch, built on the
// fetched default-branch tip. The author's repository state is never touched.
import type { GitOrigin } from "../deploy/git-origin";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import { isConcurrentlyChanged } from "./classify-movement";
import type { HarnessReviewPort } from "./harness-review-port";
import { promoteBranch, promoteCompareUrl } from "./promote-branch";
import { beforeProposalPush, readOriginFacts } from "./proposal-request";
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
      origin: GitOrigin;
      head: string;
      base: string;
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
    if (!isValidSkillSlug(name)) {
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

    const request = await beforeProposalPush(this.deps.review, {
      origin: second.origin,
      base: second.base,
      name,
    });
    if (!request.ok) {
      return request;
    }

    const push = await this.deps.git.pushSkillPromotion(
      root,
      name,
      second.head,
    );
    switch (push) {
      case "pushed":
        await request.afterPush();
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
    const facts = await readOriginFacts(this.deps.git, root);
    if (!facts.ok) {
      return facts;
    }
    const { origin, base, head } = facts;
    if (head === null) {
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
    return { ok: true, origin, head, base };
  }
}
