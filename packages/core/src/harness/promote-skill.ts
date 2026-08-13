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
  // Origin/HEAD carries a teammate's change to this skill that the fetch just
  // above brought back — recomputed fresh, never from the state the cockpit
  // showed before the press, since that can be stale by the time it lands
  // here (#579).
  | "concurrent-change"
  | "promote-failed"
  | "promote-in-progress";

// The branch travels with the URL: the cockpit names what was pushed, and
// GitHub's own form is where the pull request is opened (#574).
export type PromoteSkillResult =
  | { ok: true; branch: string; pullRequestUrl: string }
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

    const facts = await this.deps.git.readFacts(root);
    const origin =
      facts.originUrl === null ? null : parseGitOrigin(facts.originUrl);
    if (origin === null) {
      return { ok: false, error: "no-usable-origin" };
    }

    // The commit is built on the tip this fetch brought back, so a stale
    // mirror can never be the base a pull request is opened against.
    const head = facts.defaultBranchCommit;
    const branch = facts.defaultBranch;
    if (outcome !== "fetched" || head === null || branch === null) {
      return { ok: false, error: "no-answer" };
    }

    // The same fact the cockpit warns with, recomputed against what this
    // fetch just brought back rather than the read that rendered the warning
    // — a teammate's push landing in between must still be caught here, or
    // promoting silently overwrites it. Scoped to this one skill via the
    // merge base, so an unrelated commit elsewhere on origin/HEAD never
    // blocks this promotion (#579).
    const mergeBase = await this.deps.git.mergeBaseCommit(root);
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

    // ponytail: this check and the push below are not atomic — a teammate's
    // push landing in the gap (local object work only, no further network
    // call until the push itself) still rides through. Closing it needs a
    // lease on origin/HEAD's tip, and that lease is whole-repo where this
    // check is one skill: it would refuse pushes over an unrelated commit,
    // trading this bug for the one just fixed above. Detects the race,
    // does not prevent it, the same trade-off `source-changed` already
    // accepts for the working tree a few lines below (#579).
    const push = await this.deps.git.pushSkillPromotion(root, name, head);
    switch (push) {
      case "pushed":
        return {
          ok: true,
          branch: promoteBranch(name),
          pullRequestUrl: promoteCompareUrl(origin, branch, name),
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
}
