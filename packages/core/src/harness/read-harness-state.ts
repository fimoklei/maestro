// No git stdout, stderr, or remote text reaches this use-case, so none can reach a response.
import { parseGitOrigin } from "../deploy/git-origin";
import { type GitHubPage, githubPageFromOriginUrl } from "../git/github-page";
import type {
  HarnessObject,
  HarnessPrimitiveType,
  PrimitiveRef,
} from "./harness-primitive";
import { primitiveKey } from "./harness-primitive";
import type { HarnessReviewPort, ViewerRead } from "./harness-review-port";
import { buildStages, type HarnessStages } from "./harness-stages";
import { type LatestRelease, readLatestRelease } from "./latest-release";
import type { ProposalKind } from "./proposal-request";
import {
  proposeReleaseVersion,
  type SemverStep,
} from "./propose-release-version";
import {
  type PendingMovement,
  type ReleaseDelta,
  readReleaseDelta,
} from "./release-delta";
import { type ReleaseBlock, readReleaseReadiness } from "./release-readiness";
import type { HarnessSkillTree } from "./released-content";
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

/** One commit on the default branch that puts the named primitives back as `source` holds them. */
export type DefaultBranchWithdrawal = {
  defaultBranch: string;
  // The tip the confirmation read: the push's lease.
  tip: string;
  // The latest release's commit; null where the Harness has no release.
  source: string | null;
  refs: readonly PrimitiveRef[];
  message: string;
};

// `clone-not-current`: the local HEAD is not the tip. `refused`: the remote
// declined the push (a protected branch). Any other failure is `push-failed`.
export type WithdrawalPushOutcome =
  | "pushed"
  | "stale-tip"
  | "refused"
  | "offline"
  | "push-elsewhere"
  | "clone-not-current"
  | "push-failed";

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
/** Whether every commit a proposal branch adds carries this clone's author email. */
export type BranchAuthorship = "own" | "others" | "no-email" | "unknown";

export type HarnessPromoteRef = {
  tree: string | null;
  commit: string | null;
  // Judged over origin/HEAD.
  authorship: BranchAuthorship;
  // origin/HEAD held the branch's content in a commit the branch lacks: a
  // squash, rebase or merge commit landed it. False where unreadable.
  landed: boolean;
};

// Hash per primitive name, for one type; in `promote` the name is the one its
// branch carries.
export type HarnessHashes = {
  remote: Record<string, string>;
  promote: Record<string, HarnessPromoteRef>;
  local: Record<string, string>;
  working: Record<string, string>;
};

export type HarnessMovementTrees = Record<HarnessPrimitiveType, HarnessHashes>;

export interface HarnessGitPort {
  fetch(root: string): Promise<HarnessFetchOutcome>;
  readFacts(root: string): Promise<HarnessFacts>;
  // Moves the clone to its upstream only where no local work would be lost;
  // never throws (#978).
  catchUp(root: string): Promise<void>;
  readCloneSync(root: string): Promise<CloneSync>;
  // Skills only, for deploy, drift and import. Null is an unreadable ref,
  // never an empty harness.
  readSkillTrees(root: string, ref: string): Promise<HarnessSkillTree[] | null>;
  // Every type. Null is an unreadable ref; a missing type folder is none of that type.
  readPrimitives(root: string, ref: string): Promise<HarnessObject[] | null>;
  // The files directly at the root of `ref`'s tree, never a folder. Null is an
  // unreadable ref.
  readRootFiles(root: string, ref: string): Promise<string[] | null>;
  // Keyed by `primitiveKey`.
  readAuthors(
    root: string,
    ref: string,
    refs: PrimitiveRef[],
  ): Promise<Record<string, string | null>>;
  readMovementTrees(root: string): Promise<HarnessMovementTrees | null>;
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
  pushPromotion(
    root: string,
    ref: PrimitiveRef,
    baseCommit: string,
    kind: Exclude<ProposalKind, "deletion">,
  ): Promise<PromoteSkillOutcome>;
  pushDeletion(
    root: string,
    ref: PrimitiveRef,
    baseCommit: string,
  ): Promise<SkillPushOutcome>;
  // Builds the commit in a throwaway index, pushes it with a lease on `tip`,
  // then moves the local branch and resets the named paths in the index. The
  // working tree is never touched; nothing is written before the checks pass.
  withdrawOnDefaultBranch(
    root: string,
    withdrawal: DefaultBranchWithdrawal,
  ): Promise<WithdrawalPushOutcome>;
  readWorktreeAmbiguity(root: string): Promise<WorktreeAmbiguity | null>;
  readLocalHeadCommit(root: string): Promise<string | null>;
  // Null where the question could not be asked (fail-closed).
  readStagedDifference(
    root: string,
    ref: PrimitiveRef,
  ): Promise<boolean | null>;
  // Writes the primitive under its own folder or file name. Never touches
  // HEAD, the real index, or the working tree.
  writePrimitiveInto(
    root: string,
    ref: PrimitiveRef,
    commit: string,
    into: string,
  ): Promise<"written" | "missing" | "failed">;
  // The primitive's files in the working tree that its pushed proposal branch
  // lacks or holds differently, relative to the primitive; null is no answer.
  readUnproposedFiles(
    root: string,
    ref: PrimitiveRef,
  ): Promise<string[] | null>;
  // The named primitives' files, untracked included, that the working tree
  // adds or holds differently from `commit`, relative to the Harness root;
  // null is no answer.
  readWorkingDifferences(
    root: string,
    refs: readonly PrimitiveRef[],
    commit: string,
  ): Promise<string[] | null>;
  // False where a push to origin would land somewhere else than the fetch.
  readPushesWhereItFetched(root: string): Promise<boolean>;
  readAuthoredHere(
    root: string,
    ref: PrimitiveRef,
    base: string,
  ): Promise<BranchAuthorship>;
  // Never `--force`. A branch already gone counts as deleted.
  deleteProposalBranch(
    root: string,
    ref: PrimitiveRef,
  ): Promise<"deleted" | "failed">;
}

// Keyed by root, so a second harness never inherits the first one's age (#516).
export interface HarnessFreshnessPort {
  read(root: string): Promise<HarnessFreshness>;
  record(root: string, freshness: HarnessFreshness): Promise<void>;
}

// `unknown`: nothing to compare against; an uncheckable check is never a verdict.
type HarnessReleaseState =
  | "released"
  | "pending-release"
  | "never-released"
  | "unknown";

export type HarnessState = {
  origin: string;
  /** The Origin fact's link; absent where the origin names no GitHub page. */
  github?: GitHubPage;
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

// `findings` are advisory and never disable a release (#519); `blocked` alone does.
export type ReleasePlan = {
  delta: PendingMovement[];
  previousTag: string | null;
  // Catches a tag force-moved under an unchanged name.
  previousTagCommit: string | null;
  proposedStep: SemverStep;
  reason: string;
  versions: Record<SemverStep, string>;
  revision: string;
  defaultBranch: string;
  findings: StructuralFinding[];
  blocked: ReleaseBlock | null;
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
    fetchHarness: (root: string) => Promise<HarnessFetchOutcome>;
    // A failed review read degrades one stage, never the others. Read half
    // only: a Harness read must never change a proposal.
    review: Pick<HarnessReviewPort, "readReviews" | "readViewer">;
  };

  constructor(deps: ReadHarnessState["deps"]) {
    this.deps = deps;
  }

  // Concurrent refreshes share one fetch, then each reads on its own.
  async refresh(): Promise<HarnessStateResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    await this.deps.fetchHarness(root);
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
    const { facts, latest } = await readLatestRelease(
      this.deps.git,
      this.deps.freshness,
      root,
    );
    const ready = await readReleaseReadiness(
      this.deps.git,
      root,
      facts,
      latest,
    );
    if (!ready.ok) {
      return ready;
    }
    const { released, head, defaultBranch, content } = ready.readiness;
    // One read serves the delta, the block and the checks: two reads can disagree.
    if (content === null) {
      return { ok: false, error: "no-answer" };
    }
    const delta = content.delta.movements;

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
        defaultBranch,
        findings: await this.structuralFindings(
          root,
          head,
          content.delta.current,
        ),
        blocked: content.blocked,
      },
    };
  }

  // Every skill, not only moved ones: an unchanged skill can still ship a broken manifest.
  private async structuralFindings(
    root: string,
    head: string,
    current: HarnessObject[],
  ): Promise<StructuralFinding[]> {
    const names = current
      .filter((object) => object.type === "skill")
      .map((object) => object.name)
      .sort();
    const manifests = await this.deps.git.readSkillManifests(root, head, names);
    return names.flatMap((name) => {
      const problem = validateSkillStructure(manifests[name] ?? null);
      return problem === null ? [] : [{ skill: name, problem }];
    });
  }

  private async stateFor(root: string): Promise<HarnessStateResult> {
    const { facts, freshness, latest } = await readLatestRelease(
      this.deps.git,
      this.deps.freshness,
      root,
    );
    const origin =
      facts.originUrl === null ? null : parseGitOrigin(facts.originUrl);
    if (origin === null) {
      return { ok: false, error: "no-usable-origin" };
    }

    const released = latest.known ? latest.tag : null;
    const head = facts.defaultBranchCommit;
    // A delta nobody could compute is null, never empty.
    const delta: ReleaseDelta | null =
      latest.known && head !== null
        ? await readReleaseDelta(this.deps.git, root, released, head)
        : null;
    const movements = delta?.movements ?? null;
    const trees = await this.deps.git.readMovementTrees(root);
    const atMergeBase =
      head === null ? null : await this.hashesAtMergeBase(root, head);
    // One batched read for the whole Harness, never one per skill.
    const review = await this.deps.review.readReviews(origin);
    // Without requests there is nobody to compare the sign-in with.
    const viewer: ViewerRead =
      review.outcome === "read"
        ? await this.deps.review.readViewer(origin)
        : { outcome: "unavailable" };
    return {
      ok: true,
      state: {
        origin: `${origin.host}/${origin.ownerRepo}`,
        github: githubPageFromOriginUrl(facts.originUrl) ?? undefined,
        releasedVersion: released?.name ?? null,
        defaultBranch: facts.defaultBranch,
        releaseState:
          movements !== null && trees !== null
            ? releaseState(latest, head, movements)
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
          viewer,
          release: movements,
        }),
      },
    };
  }

  // Tells a teammate's change apart from the author's unpushed commit (#579).
  // `head` is the commit this read settled on, never a fresh `origin/HEAD`.
  // Keyed by `primitiveKey`.
  private async hashesAtMergeBase(
    root: string,
    head: string,
  ): Promise<Record<string, string> | null> {
    const mergeBase = await this.deps.git.mergeBaseCommit(root, head);
    if (mergeBase === null) {
      return null;
    }
    const objects = await this.deps.git.readPrimitives(root, mergeBase);
    return objects === null
      ? null
      : Object.fromEntries(
          objects.map((object) => [primitiveKey(object), object.hash]),
        );
  }
}

// Must match the Pending release stage, so the summary never claims work the stage does not list (#845).
const releaseState = (
  latest: LatestRelease,
  defaultBranchCommit: string | null,
  movements: PendingMovement[],
): HarnessReleaseState => {
  if (!latest.known || defaultBranchCommit === null) {
    return "unknown";
  }
  if (latest.tag === null) {
    return "never-released";
  }
  return movements.length === 0 ? "released" : "pending-release";
};
