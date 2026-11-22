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
  CATEGORIES_SUBJECT,
  type ListSubject,
  type ProposalSubject,
} from "./proposal-subject";
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
  | "push-elsewhere"
  | "source-changed"
  | "push-failed";

export type SkillPushOutcome = Exclude<PromoteSkillOutcome, "skill-missing">;

export type ListFilePush = {
  subject: ListSubject;
  text: string;
  defaultTip: string;
  message: string;
};

export type ListPushOutcome = Exclude<SkillPushOutcome, "source-changed">;

export type DefaultBranchWithdrawal = {
  defaultBranch: string;
  tip: string;
  source: string | null;
  refs: readonly ProposalSubject[];
  message: string;
};

export type WithdrawalPushOutcome =
  | "pushed"
  | "stale-tip"
  | "refused"
  | "offline"
  | "push-elsewhere"
  | "clone-not-current"
  | "push-failed";

export type WorktreeAmbiguity =
  | "sparse-checkout"
  | "merge-in-progress"
  | "rebase-in-progress"
  | "unresolved-conflicts"
  | "unreadable";

export type HarnessFreshness = {
  outcome: HarnessFetchOutcome | null;
  lastFetchedAt: string | null;
};

export type HarnessTag = { name: string; commit: string };

export type FileAtRef =
  | { kind: "absent" }
  | { kind: "too-large" }
  | { kind: "text"; text: string };

export type CloneSync =
  | "current"
  | "behind"
  | "local-changes"
  | "diverged"
  | "no-upstream"
  | "unreadable";

export type HarnessFacts = {
  originUrl: string | null;
  defaultBranch: string | null;
  defaultBranchCommit: string | null;
  tags: HarnessTag[] | null;
};

export type BranchAuthorship = "own" | "others" | "no-email" | "unknown";

export type HarnessPromoteRef = {
  tree: string | null;
  commit: string | null;
  authorship: BranchAuthorship;
  landed: boolean;
};

export type HarnessHashes = {
  remote: Record<string, string>;
  promote: Record<string, HarnessPromoteRef>;
  local: Record<string, string>;
  working: Record<string, string>;
};

export type HarnessMovementTrees = Record<HarnessPrimitiveType, HarnessHashes>;

export type ListProposalRefs = {
  remote: string | null;
  promote: HarnessPromoteRef | null;
};

export interface HarnessGitPort {
  fetch(root: string): Promise<HarnessFetchOutcome>;
  readFacts(root: string): Promise<HarnessFacts>;
  // Moves the clone to its upstream only where no local work would be lost;
  // never throws (#978).
  catchUp(root: string): Promise<void>;
  readCloneSync(root: string): Promise<CloneSync>;
  readSkillTrees(root: string, ref: string): Promise<HarnessSkillTree[] | null>;
  readPrimitives(root: string, ref: string): Promise<HarnessObject[] | null>;
  readRootFiles(root: string, ref: string): Promise<string[] | null>;
  readFileAt(
    root: string,
    ref: string,
    path: string,
    maxBytes: number,
  ): Promise<FileAtRef | null>;
  readListHash(
    root: string,
    ref: string,
    subject: ListSubject,
  ): Promise<{ hash: string | null } | null>;
  readAuthors(
    root: string,
    ref: string,
    refs: ProposalSubject[],
  ): Promise<Record<string, string | null>>;
  readMovementTrees(root: string): Promise<HarnessMovementTrees | null>;
  readListProposal(
    root: string,
    subject: ListFilePush["subject"],
  ): Promise<ListProposalRefs | null>;
  mergeBaseCommit(root: string, remoteCommit: string): Promise<string | null>;
  readSkillManifests(
    root: string,
    ref: string,
    names: string[],
  ): Promise<Record<string, string | null>>;
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
  // The commit's tree is `defaultTip`'s with the file; the adapter picks its
  // parents. Never `--force`, and never touches the working tree.
  pushListFile(root: string, push: ListFilePush): Promise<ListPushOutcome>;
  withdrawOnDefaultBranch(
    root: string,
    withdrawal: DefaultBranchWithdrawal,
  ): Promise<WithdrawalPushOutcome>;
  readWorktreeAmbiguity(root: string): Promise<WorktreeAmbiguity | null>;
  readLocalHeadCommit(root: string): Promise<string | null>;
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
  readUnproposedFiles(
    root: string,
    ref: PrimitiveRef,
  ): Promise<string[] | null>;
  readWorkingDifferences(
    root: string,
    refs: readonly PrimitiveRef[],
    commit: string,
  ): Promise<string[] | null>;
  readPushesWhereItFetched(root: string): Promise<boolean>;
  readAuthoredHere(
    root: string,
    subject: ProposalSubject,
    base: string,
  ): Promise<BranchAuthorship>;
  deleteProposalBranch(
    root: string,
    subject: ProposalSubject,
  ): Promise<"deleted" | "failed">;
}

export interface HarnessFreshnessPort {
  read(root: string): Promise<HarnessFreshness>;
  record(root: string, freshness: HarnessFreshness): Promise<void>;
}

type HarnessReleaseState =
  | "released"
  | "pending-release"
  | "never-released"
  | "unknown";

export type HarnessState = {
  origin: string;
  github?: GitHubPage;
  releasedVersion: string | null;
  defaultBranch: string | null;
  releaseState: HarnessReleaseState;
  freshness: HarnessFreshness;
  cloneSync: CloneSync;
  localHeadCommit: string | null;
  stages: HarnessStages;
};

export type HarnessStateError = "not-configured" | "no-usable-origin";

export type HarnessStateResult =
  | { ok: true; state: HarnessState }
  | { ok: false; error: HarnessStateError };

export type ReleasePlan = {
  delta: PendingMovement[];
  previousTag: string | null;
  previousTagCommit: string | null;
  proposedStep: SemverStep;
  reason: string;
  versions: Record<SemverStep, string>;
  revision: string;
  defaultBranch: string;
  findings: StructuralFinding[];
  blocked: ReleaseBlock | null;
};

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
    review: Pick<HarnessReviewPort, "readReviews" | "readViewer">;
  };

  constructor(deps: ReadHarnessState["deps"]) {
    this.deps = deps;
  }

  async refresh(): Promise<HarnessStateResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    await this.deps.fetchHarness(root);
    return this.stateFor(root);
  }

  async execute(): Promise<HarnessStateResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    return this.stateFor(root);
  }

  async planRelease(): Promise<ReleasePlanResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    return await this.planReleaseAt(root);
  }

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
    if (content === null) {
      return { ok: false, error: "no-answer" };
    }
    const delta = content.delta.movements;

    const proposal = proposeReleaseVersion(released?.name ?? null, delta);
    return {
      ok: true,
      plan: {
        delta,
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
    const delta: ReleaseDelta | null =
      latest.known && head !== null
        ? await readReleaseDelta(this.deps.git, root, released, head)
        : null;
    const movements = delta?.movements ?? null;
    const trees = await this.deps.git.readMovementTrees(root);
    const list = await this.deps.git.readListProposal(root, CATEGORIES_SUBJECT);
    const atMergeBase =
      head === null ? null : await this.hashesAtMergeBase(root, head);
    const review = await this.deps.review.readReviews(origin);
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
          list,
          atMergeBase,
          review,
          viewer,
          release: movements,
        }),
      },
    };
  }

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
