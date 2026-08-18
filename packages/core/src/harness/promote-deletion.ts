// Moving one skill's *removal* into review: the same fetch, the same
// `maestro/<skill>` branch and the same pull-request link a promotion uses,
// with the skill's subtree taken out of the fetched tip instead of replaced.
// Publishing by absence is never inferred — it takes a confirmation the author
// gave against a stated origin/HEAD (ADR-0021, #580).
import { parseGitOrigin } from "../deploy/git-origin";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import {
  isPromotableSkillName,
  promoteBranch,
  promoteCompareUrl,
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
  // origin/HEAD's copy of this skill is not the one the confirmation was given
  // against: a teammate's change landed, or the skill is already gone. Either
  // way the author confirmed removing something else (#580).
  | "confirmation-stale"
  // Not the movement the row named: the skill is back on disk, or local HEAD
  // never tracked it. `isLocalDeletion`'s two facts, re-read at the press.
  | "not-deleted"
  // An incomplete working tree must not masquerade as intent: each ambiguity
  // arrives under its own name, so the copy can say which one it is.
  | WorktreeAmbiguity
  | "push-elsewhere"
  | "source-changed"
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
  };

  constructor(deps: PromoteSkillDeletion["deps"]) {
    this.deps = deps;
  }

  // Shares the promotion lock, keyed by harness root: a removal and an edit
  // building commits from the same fetched tip would each answer for refs the
  // other moved.
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

    // Asked before the deletion itself is read: every fact below comes from a
    // working tree, and one of these makes the whole tree unable to answer.
    const ambiguity = await this.deps.git.readWorktreeAmbiguity(root);
    if (ambiguity !== null) {
      return { ok: false, error: ambiguity };
    }

    // The deletion re-read at the press, never taken from the row: tracked at
    // local HEAD and gone from the working tree, `isLocalDeletion`'s two facts
    // (#575). A skill that came back is an edit, and takes the other route.
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

    // Read from the refs this call just fetched, never from what the row was
    // painted with: the whole point of carrying the hash is that the picture
    // the author confirmed against can be stale by the time it lands here.
    const remoteTrees = await this.deps.git.readSkillTrees(root, head);
    if (remoteTrees === null) {
      return { ok: false, error: "no-answer" };
    }
    const remote = remoteTrees.find((tree) => tree.name === name)?.treeHash;
    if (remote !== seenRemoteTree) {
      return { ok: false, error: "confirmation-stale" };
    }

    const push = await this.deps.git.pushSkillDeletion(root, name, head);
    switch (push) {
      case "pushed":
        return {
          ok: true,
          branch: promoteBranch(name),
          pullRequestUrl: promoteCompareUrl(origin, branch, name),
        };
      case "push-elsewhere":
        return { ok: false, error: "push-elsewhere" };
      case "source-changed":
      case "skill-missing":
        return { ok: false, error: "source-changed" };
      case "offline":
        return { ok: false, error: "no-answer" };
      case "push-failed":
        return { ok: false, error: "promote-failed" };
    }
  }
}
