// No git stdout, stderr, or remote text reaches this use-case, so none can reach a response.
import { parseGitOrigin } from "../deploy/git-origin";
import type { HarnessReviewPort } from "./harness-review-port";
import { buildStages, type HarnessStages } from "./harness-stages";
import {
  proposeReleaseVersion,
  type SemverStep,
} from "./propose-release-version";
import { recordFetch } from "./record-fetch";
import { highestReleaseTag } from "./release-tag";
import type { HarnessSkillTree, SkillMovement } from "./skill-movements";
import { diffSkillTrees } from "./skill-movements";
import {
  type StructuralFinding,
  validateSkillStructure,
} from "./validate-skill-structure";

export type HarnessFetchOutcome = "fetched" | "offline" | "fetch-failed";

// `already-exists`: another author's tag claims that name; never force over it.
// `stale-tip`: the lease refused because the branch moved, so nothing was created.
export type PublishTagOutcome =
  | "pushed"
  | "already-exists"
  | "stale-tip"
  | "offline"
  | "push-failed";

export type PromoteSkillOutcome =
  | "pushed"
  | "skill-missing"
  | "offline"
  // The push destination is not the origin the pull-request link names.
  | "push-elsewhere"
  // The skill's directory changed while it was being read.
  | "source-changed"
  | "push-failed";

export type SkillPushOutcome = Exclude<PromoteSkillOutcome, "skill-missing">;

// A removal is published from what is absent on disk, so any of these would
// read as a deletion nobody made. `unreadable` is fail-closed.
export type WorktreeAmbiguity =
  | "sparse-checkout"
  | "merge-in-progress"
  | "rebase-in-progress"
  | "unresolved-conflicts"
  | "unreadable";

// `outcome: null` means no fetch has been attempted yet; `lastFetchedAt: null`
// means none has ever succeeded. The two are independent.
export type HarnessFreshness = {
  outcome: HarnessFetchOutcome | null;
  lastFetchedAt: string | null;
};

export type HarnessTag = { name: string; commit: string };

// `local-changes`: uncommitted work on a path upstream changed, so catch-up
// leaves it. A local commit ahead of upstream is `current`.
export type CloneSync =
  | "current"
  | "behind"
  | "local-changes"
  | "diverged"
  | "no-upstream"
  | "unreadable";

// `tags: null` is an unreadable namespace, never a harness with no releases.
export type HarnessFacts = {
  originUrl: string | null;
  defaultBranch: string | null;
  defaultBranchCommit: string | null;
  tags: HarnessTag[] | null;
};

// A null tree proposes deleting the skill; a null commit is an unreadable ref,
// never an absent branch.
export type HarnessPromoteRef = {
  tree: string | null;
  commit: string | null;
};

// Tree hash per skill name; in `promote` the key is the branch.
export type HarnessSkillTrees = {
  remote: Record<string, string>;
  promote: Record<string, HarnessPromoteRef>;
  local: Record<string, string>;
  working: Record<string, string>;
};

export interface HarnessGitPort {
  fetch(root: string): Promise<HarnessFetchOutcome>;
  readFacts(root: string): Promise<HarnessFacts>;
  // Moves the clone to its upstream only where no local work would be lost;
  // never throws (#978).
  catchUp(root: string): Promise<void>;
  readCloneSync(root: string): Promise<CloneSync>;
  // Null is an unreadable ref, never an empty harness.
  readSkillTrees(root: string, ref: string): Promise<HarnessSkillTree[] | null>;
  readSkillAuthors(
    root: string,
    ref: string,
    names: string[],
  ): Promise<Record<string, string | null>>;
  readMovementTrees(root: string): Promise<HarnessSkillTrees | null>;
  // Takes the exact commit, never `origin/HEAD`, which can move under a concurrent fetch (#579).
  mergeBaseCommit(root: string, remoteCommit: string): Promise<string | null>;
  // Null where the file is absent; an empty string is a present-but-blank manifest.
  readSkillManifests(
    root: string,
    ref: string,
    names: string[],
  ): Promise<Record<string, string | null>>;
  // Never `--force`. `defaultBranch` is never written: it is the lease the tag rides on.
  publishTag(
    root: string,
    name: string,
    commit: string,
    defaultBranch: string,
  ): Promise<PublishTagOutcome>;
  // Never checks out, stages in the real index, moves HEAD, or force-pushes (#574, #578).
  pushSkillPromotion(
    root: string,
    name: string,
    baseCommit: string,
  ): Promise<PromoteSkillOutcome>;
  pushSkillDeletion(
    root: string,
    name: string,
    baseCommit: string,
  ): Promise<SkillPushOutcome>;
  readWorktreeAmbiguity(root: string): Promise<WorktreeAmbiguity | null>;
  readLocalHeadCommit(root: string): Promise<string | null>;
  // Null where the question could not be asked (fail-closed).
  readStagedSkillDifference(
    root: string,
    name: string,
  ): Promise<boolean | null>;
  // Never touches HEAD, the real index, or the working tree.
  writeSkillTreeInto(
    root: string,
    name: string,
    commit: string,
    into: string,
  ): Promise<"written" | "missing" | "failed">;
}

// Keyed by root, so a second harness never inherits the first one's age (#516).
export interface HarnessFreshnessPort {
  read(root: string): Promise<HarnessFreshness>;
  record(root: string, freshness: HarnessFreshness): Promise<void>;
}

// `unknown`: nothing to compare against; an uncheckable check is never a verdict.
export type HarnessReleaseState =
  | "released"
  | "pending-release"
  | "never-released"
  | "unknown";

export type PendingSkillMovement = SkillMovement & { author: string | null };

export type HarnessState = {
  origin: string;
  releasedVersion: string | null;
  defaultBranch: string | null;
  releaseState: HarnessReleaseState;
  freshness: HarnessFreshness;
  cloneSync: CloneSync;
  // A fact to compare a restoration against, never a source the browser may name.
  localHeadCommit: string | null;
  stages: HarnessStages;
};

export type HarnessStateError = "not-configured" | "no-usable-origin";

export type HarnessStateResult =
  | { ok: true; state: HarnessState }
  | { ok: false; error: HarnessStateError };

// `findings` are advisory and never disable a release (#519).
export type ReleasePlan = {
  delta: PendingSkillMovement[];
  previousTag: string | null;
  // Catches a tag force-moved under an unchanged name.
  previousTagCommit: string | null;
  proposedStep: SemverStep;
  reason: string;
  versions: Record<SemverStep, string>;
  revision: string;
  defaultBranch: string;
  findings: StructuralFinding[];
};

// `no-answer`: nothing to compare against, never an empty release.
export type ReleasePlanError =
  | "not-configured"
  | "no-usable-origin"
  | "no-answer";

export type ReleasePlanResult =
  | { ok: true; plan: ReleasePlan }
  | { ok: false; error: ReleasePlanError };

export class ReadHarnessState {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: HarnessGitPort;
    freshness: HarnessFreshnessPort;
    // A failed review read degrades one stage, never the others. Read half
    // only: a Harness read must never change a proposal.
    review: Pick<HarnessReviewPort, "readReviews">;
  };

  // One fetch per harness at a time: two fetches race over the same git refs.
  // Callers arriving mid-flight share the answer.
  private inFlight = new Map<string, Promise<HarnessStateResult>>();

  constructor(deps: ReadHarnessState["deps"]) {
    this.deps = deps;
  }

  async refresh(at: Date): Promise<HarnessStateResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }

    const running = this.inFlight.get(root);
    if (running !== undefined) {
      return running;
    }
    const fetching = this.fetchAndRead(root, at).finally(() => {
      this.inFlight.delete(root);
    });
    this.inFlight.set(root, fetching);
    return fetching;
  }

  private async fetchAndRead(
    root: string,
    at: Date,
  ): Promise<HarnessStateResult> {
    await recordFetch(this.deps, root, at);
    // Only a POST reaches here: catching up writes the working tree (#978).
    await this.deps.git.catchUp(root);
    // Never a second root lookup: a reconnect in between would report another harness.
    return this.stateFor(root);
  }

  async execute(): Promise<HarnessStateResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    return this.stateFor(root);
  }

  // Reads already-fetched refs only; no network.
  async planRelease(): Promise<ReleasePlanResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    return await this.planReleaseAt(root);
  }

  // A refused publication recomputes here against the root it already holds,
  // never a harness connected while its push was in flight (#521).
  async planReleaseAt(root: string): Promise<ReleasePlanResult> {
    const facts = await this.deps.git.readFacts(root);
    const freshness = await this.deps.freshness.read(root);
    const origin =
      facts.originUrl === null ? null : parseGitOrigin(facts.originUrl);
    if (origin === null) {
      return { ok: false, error: "no-usable-origin" };
    }

    // A failed tag read is not a first release: proposing v0.1.0 over it could
    // collide with an existing version (#519).
    const confirmed = freshness.lastFetchedAt !== null;
    const head = facts.defaultBranchCommit;
    const tags = facts.tags;
    if (
      !confirmed ||
      head === null ||
      facts.defaultBranch === null ||
      tags === null
    ) {
      return { ok: false, error: "no-answer" };
    }

    // One read serves both the delta and the checks: two reads can disagree.
    const current = await this.deps.git.readSkillTrees(root, head);
    if (current === null) {
      return { ok: false, error: "no-answer" };
    }

    const released = highestReleaseTag(tags);
    const delta = await this.movementsSince(root, released, head, current);
    if (delta === null) {
      return { ok: false, error: "no-answer" };
    }

    const proposal = proposeReleaseVersion(released?.name ?? null, delta);
    return {
      ok: true,
      plan: {
        delta,
        // Both from the proposal, so they always describe the same release.
        previousTag: proposal.previousTag,
        previousTagCommit:
          proposal.previousTag === null ? null : (released?.commit ?? null),
        proposedStep: proposal.proposedStep,
        reason: proposal.reason,
        versions: proposal.versions,
        revision: head,
        defaultBranch: facts.defaultBranch,
        findings: await this.structuralFindings(root, head, current),
      },
    };
  }

  // Every skill, not only moved ones: an unchanged skill can still ship a broken manifest.
  private async structuralFindings(
    root: string,
    head: string,
    trees: HarnessSkillTree[],
  ): Promise<StructuralFinding[]> {
    const names = trees.map((tree) => tree.name).sort();
    const manifests = await this.deps.git.readSkillManifests(root, head, names);
    return names.flatMap((name) => {
      const problem = validateSkillStructure(manifests[name] ?? null);
      return problem === null ? [] : [{ skill: name, problem }];
    });
  }

  private async stateFor(root: string): Promise<HarnessStateResult> {
    const facts = await this.deps.git.readFacts(root);
    const freshness = await this.deps.freshness.read(root);
    const origin =
      facts.originUrl === null ? null : parseGitOrigin(facts.originUrl);
    if (origin === null) {
      return { ok: false, error: "no-usable-origin" };
    }

    // Before a successful fetch the tag list says nothing, never "no release exists".
    const confirmed = freshness.lastFetchedAt !== null;
    const tags = confirmed ? facts.tags : null;
    const released = tags === null ? null : highestReleaseTag(tags);
    const head = facts.defaultBranchCommit;
    // A delta nobody could compute is null, never empty.
    const current =
      tags !== null && head !== null
        ? await this.deps.git.readSkillTrees(root, head)
        : null;
    const movements =
      current === null || head === null
        ? null
        : await this.movementsSince(root, released, head, current);
    const trees = await this.deps.git.readMovementTrees(root);
    const atMergeBase =
      head === null ? null : await this.skillTreesAtMergeBase(root, head);
    // One batched read for the whole Harness, never one per skill.
    const review = await this.deps.review.readReviews(origin);
    return {
      ok: true,
      state: {
        origin: `${origin.host}/${origin.ownerRepo}`,
        releasedVersion: released?.name ?? null,
        defaultBranch: facts.defaultBranch,
        releaseState:
          tags !== null && movements !== null && trees !== null
            ? releaseState(released, head, movements)
            : "unknown",
        freshness,
        cloneSync: await this.deps.git.readCloneSync(root),
        localHeadCommit: await this.deps.git.readLocalHeadCommit(root),
        stages: buildStages({
          origin,
          defaultBranch: facts.defaultBranch,
          trees,
          atMergeBase,
          review,
          release: movements,
        }),
      },
    };
  }

  // Tells a teammate's change apart from the author's unpushed commit (#579).
  // `head` is the commit this read settled on, never a fresh `origin/HEAD`.
  private async skillTreesAtMergeBase(
    root: string,
    head: string,
  ): Promise<Record<string, string> | null> {
    const mergeBase = await this.deps.git.mergeBaseCommit(root, head);
    if (mergeBase === null) {
      return null;
    }
    const trees = await this.deps.git.readSkillTrees(root, mergeBase);
    return trees === null
      ? null
      : Object.fromEntries(trees.map((tree) => [tree.name, tree.treeHash]));
  }

  // The delta is content, not reachability: a tag off the default branch compares like any other.
  private async movementsSince(
    root: string,
    released: HarnessTag | null,
    head: string,
    current: HarnessSkillTree[],
  ): Promise<PendingSkillMovement[] | null> {
    const previous =
      released === null
        ? []
        : await this.deps.git.readSkillTrees(root, released.commit);
    if (previous === null) {
      return null;
    }
    const movements = diffSkillTrees(previous, current);

    const authored = await this.deps.git.readSkillAuthors(
      root,
      head,
      movements.map((movement) => movement.name),
    );
    // A skill the default branch never saw has its author on the release ref.
    const orphaned = movements
      .filter(
        (movement) =>
          movement.kind === "removed" && authored[movement.name] == null,
      )
      .map((movement) => movement.name);
    const atRelease =
      released !== null && orphaned.length > 0
        ? await this.deps.git.readSkillAuthors(root, released.commit, orphaned)
        : {};

    return movements.map((movement) => ({
      ...movement,
      author: authored[movement.name] ?? atRelease[movement.name] ?? null,
    }));
  }
}

// Must match the Pending release stage, so the summary never claims work the stage does not list (#845).
const releaseState = (
  released: HarnessTag | null,
  defaultBranchCommit: string | null,
  movements: SkillMovement[],
): HarnessReleaseState => {
  if (defaultBranchCommit === null) {
    return "unknown";
  }
  if (released === null) {
    return "never-released";
  }
  return movements.length === 0 ? "released" : "pending-release";
};
