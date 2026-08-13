// Moving one skill's working-tree content into review: fetch, build a commit on
// the fetched default-branch tip, push it to that skill's own branch. The
// author's repository state is never touched — git details stay behind the port
// (ADR-0021, security.md).
import { parseGitOrigin } from "../deploy/git-origin";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isConcurrentlyChanged } from "./classify-movement";
import {
  isPromotableSkillName,
  promoteBranch,
  promoteCompareUrl,
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
  // Origin/HEAD carries a teammate's change to this skill that a fetch just
  // brought back — recomputed fresh, never from the state the cockpit showed
  // before the press, since that can be stale by the time it lands here
  // (#579).
  | "concurrent-change"
  | "promote-failed"
  | "promote-in-progress";

// The branch travels with the URL: the cockpit names what was pushed, and
// GitHub's own form is where the pull request is opened (#574).
export type PromoteSkillResult =
  | { ok: true; branch: string; pullRequestUrl: string }
  | { ok: false; error: PromoteSkillError };

type Checked =
  | {
      ok: true;
      origin: NonNullable<ReturnType<typeof parseGitOrigin>>;
      head: string;
      branch: string;
    }
  | { ok: false; error: PromoteSkillError };

export class PromoteSkill {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: HarnessGitPort;
    freshness: HarnessFreshnessPort;
    locks: InFlightLocks;
  };

  constructor(deps: PromoteSkill["deps"]) {
    this.deps = deps;
  }

  // One promotion per harness at a time: two pushes building commits from the
  // same fetched tip would each answer for refs the other moved.
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

    // Re-fetched and rechecked right before the push, rather than trusting
    // the read above: the gap between a check and a push is where a
    // teammate's change would otherwise ride through unnoticed. What
    // remains after this is local object work and the push itself — no
    // further network call this promotion makes touches the default branch
    // (#579).
    const refetched = await this.deps.git.fetch(root);
    if (refetched !== "fetched") {
      return { ok: false, error: "no-answer" };
    }
    const second = await this.checkNotConcurrent(root, name);
    if (!second.ok) {
      return second;
    }

    const push = await this.deps.git.pushSkillPromotion(
      root,
      name,
      second.head,
    );
    switch (push) {
      case "pushed":
        return {
          ok: true,
          branch: promoteBranch(name),
          pullRequestUrl: promoteCompareUrl(second.origin, second.branch, name),
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

  // The default branch's current tip, and whether a teammate's change to
  // this one skill already sits there — scoped to the skill via the merge
  // base, so an unrelated commit elsewhere on origin/HEAD never blocks this
  // promotion (#579).
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
    return { ok: true, origin, head, branch };
  }
}
