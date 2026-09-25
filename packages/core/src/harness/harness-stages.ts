// Stage membership is independent: one skill may hold a row in every stage.
import type { GitOrigin } from "../deploy/git-origin";
import { isConcurrentlyChanged, isLocalDeletion } from "./classify-movement";
import {
  type HarnessReviewRead,
  matchesProposal,
  type RequestedReviewer,
  type ReviewRequest,
} from "./harness-review-port";
import { promoteBranch } from "./promote-branch";
import type { HarnessSkillTrees } from "./read-harness-state";
import type { SkillMovement } from "./skill-movements";

export type HarnessStage =
  | "pending-proposal"
  | "pending-review"
  | "pending-release";

const STAGE_ORDER = [
  "pending-proposal",
  "pending-review",
  "pending-release",
] as const satisfies readonly HarnessStage[];

type ProposalStatus = "not-yet-proposed" | "new-local-work" | "deleted-locally";

export type ReviewStatus =
  | "draft"
  | "waiting-for-review"
  | "changes-requested"
  | "approved-awaiting-merge"
  | "pull-request-missing"
  | "proposal-merged"
  | "proposal-closed"
  | "multiple-pull-requests";

export type ReleaseStatus = "added" | "changed" | "renamed" | "deleted";

export type StageStatus = ProposalStatus | ReviewStatus | ReleaseStatus;

export type ReviewRequestLink = {
  number: number;
  url: string;
  headBranch: string;
  baseBranch: string;
};

// `number` is null for a prepared branch nobody opened a request for.
export type ProposalComparison =
  | { kind: "proposal"; number: number | null }
  | { kind: "default-branch" };

export type HarnessStageRow = {
  stage: HarnessStage;
  skill: string;
  status: StageStatus;
  // This stage's own deletion fact. Never read across stages.
  deletion: boolean;
  requests: ReviewRequestLink[];
  reviewers: RequestedReviewer[];
  comparison: ProposalComparison | null;
  // Null where any membership is unknown: an unknown must never read as "only here".
  alsoIn: HarnessStage[] | null;
  concurrentChange: boolean;
  // Only in the working tree, so a deletion is made on disk (#798).
  localOnly: boolean;
  // The token a deletion confirmation is given against (#580).
  remoteTree: string | null;
  // From the local trees alone, never from `deletion`, which a review row
  // takes from the promote branch.
  restorable: boolean;
  previousName: string | null;
};

// `bound` is the limit a read filled; null when the answer was complete.
export type HarnessStageRead =
  | { outcome: "read"; rows: HarnessStageRow[]; bound: number | null }
  | { outcome: "unknown" }
  | { outcome: "unavailable" };

export type HarnessStages = {
  proposal: HarnessStageRead;
  review: HarnessStageRead;
  release: HarnessStageRead;
};

const RELEASE_STATUS: Record<SkillMovement["kind"], ReleaseStatus> = {
  added: "added",
  changed: "changed",
  renamed: "renamed",
  removed: "deleted",
};

export type StageInput = {
  origin: GitOrigin;
  defaultBranch: string | null;
  // Null makes the two local stages unknown, never empty.
  trees: HarnessSkillTrees | null;
  atMergeBase: Record<string, string> | null;
  review: HarnessReviewRead;
  release: SkillMovement[] | null;
};

export const buildStages = (input: StageInput): HarnessStages => {
  const release = releaseStage(input.release);
  const matches = matchRequests(input);
  const review = reviewStage(input, matches);
  const proposal = proposalStage(input, matches);
  return withCrossStage({ proposal, review, release }, input, matches);
};

type SkillMatches = Map<string, ReviewRequest[]>;

const matchRequests = ({
  origin,
  defaultBranch,
  trees,
  review,
  release,
}: StageInput): SkillMatches => {
  const matches: SkillMatches = new Map();
  if (review.outcome !== "read" || defaultBranch === null) {
    return matches;
  }
  for (const skill of everySkill(trees, release)) {
    matches.set(
      skill,
      review.requests.filter((request) =>
        matchesProposal(request, {
          ownerRepo: origin.ownerRepo,
          branch: promoteBranch(skill),
          base: defaultBranch,
        }),
      ),
    );
  }
  return matches;
};

const everySkill = (
  trees: HarnessSkillTrees | null,
  release: SkillMovement[] | null,
): string[] => {
  const names = new Set<string>();
  if (trees !== null) {
    for (const map of Object.values(trees)) {
      for (const name of Object.keys(map)) {
        names.add(name);
      }
    }
  }
  for (const movement of release ?? []) {
    names.add(movement.name);
  }
  return [...names].sort();
};

const link = (request: ReviewRequest): ReviewRequestLink => ({
  number: request.number,
  url: request.url,
  headBranch: request.headBranch,
  baseBranch: request.baseBranch,
});

const blankRow = (
  stage: HarnessStage,
  skill: string,
  status: StageStatus,
): HarnessStageRow => ({
  stage,
  skill,
  status,
  deletion: false,
  requests: [],
  reviewers: [],
  comparison: null,
  alsoIn: null,
  concurrentChange: false,
  localOnly: false,
  remoteTree: null,
  restorable: false,
  previousName: null,
});

// Local places only, so every stage gives the same answer.
const isRestorable = (trees: HarnessSkillTrees, skill: string): boolean =>
  isLocalDeletion({
    remote: null,
    promote: null,
    local: trees.local[skill] ?? null,
    working: trees.working[skill] ?? null,
  });

const releaseStage = (release: SkillMovement[] | null): HarnessStageRead => {
  if (release === null) {
    return { outcome: "unknown" };
  }
  return {
    outcome: "read",
    bound: null,
    rows: release.map((movement) => ({
      ...blankRow(
        "pending-release",
        movement.name,
        RELEASE_STATUS[movement.kind],
      ),
      deletion: movement.kind === "removed",
      previousName: movement.previousName ?? null,
    })),
  };
};

// A branch whose tip is a merged request's head commit is spent. Without a
// review read proving that, content equal to origin/HEAD is the fallback.
// A bounded (incomplete) read proves nothing spent.
const currentProposal = (
  trees: HarnessSkillTrees,
  skill: string,
  matches: SkillMatches,
  completeRead: boolean,
): { tree: string | null } | null => {
  const branch = trees.promote[skill];
  if (branch === undefined) {
    return null;
  }
  const { tree } = branch;
  const matching = matches.get(skill) ?? [];
  // An open request outranks everything.
  if (matching.some((request) => request.state === "open")) {
    return { tree };
  }
  // A tip nobody could read proves nothing spent either.
  const spent =
    completeRead &&
    branch.commit !== null &&
    matching.some(
      (request) =>
        request.state === "merged" && request.headCommit === branch.commit,
    );
  if (spent) {
    return null;
  }
  return tree !== (trees.remote[skill] ?? null) ? { tree } : null;
};

const isCompleteRead = (review: HarnessReviewRead): boolean =>
  review.outcome === "read" && review.complete;

const proposalStage = (
  { trees, atMergeBase, review }: StageInput,
  matches: SkillMatches,
): HarnessStageRead => {
  if (trees === null) {
    return { outcome: "unknown" };
  }
  const complete = isCompleteRead(review);
  const rows: HarnessStageRow[] = [];
  for (const skill of everySkill(trees, null)) {
    const branch = trees.promote[skill];
    const hashes = {
      remote: trees.remote[skill] ?? null,
      promote: branch === undefined ? null : { tree: branch.tree },
      local: trees.local[skill] ?? null,
      working: trees.working[skill] ?? null,
    };
    const proposal = currentProposal(trees, skill, matches, complete);
    // Against the default branch, also differing from local HEAD separates an
    // own edit from a clone merely behind.
    const waiting =
      proposal === null
        ? hashes.working !== hashes.remote && hashes.working !== hashes.local
        : hashes.working !== proposal.tree;
    if (!waiting) {
      continue;
    }
    const open = (matches.get(skill) ?? []).filter(
      (request) => request.state === "open",
    );
    // With several open requests, linking one would be arbitrary.
    const sole = open.length === 1 ? open[0] : undefined;
    rows.push({
      ...blankRow(
        "pending-proposal",
        skill,
        isLocalDeletion(hashes)
          ? "deleted-locally"
          : proposal === null
            ? "not-yet-proposed"
            : "new-local-work",
      ),
      deletion: isLocalDeletion(hashes),
      restorable: isRestorable(trees, skill),
      requests: sole === undefined ? [] : [link(sole)],
      comparison:
        proposal === null
          ? { kind: "default-branch" }
          : { kind: "proposal", number: sole?.number ?? null },
      concurrentChange: isConcurrentlyChanged(
        hashes,
        atMergeBase === null ? undefined : (atMergeBase[skill] ?? null),
      ),
      localOnly:
        hashes.remote === null && hashes.local === null && branch === undefined,
      remoteTree: hashes.remote,
    });
  }
  return { outcome: "read", rows, bound: null };
};

const openStatus = (request: ReviewRequest): ReviewStatus => {
  // Draft wins over any earlier verdict.
  if (request.draft) {
    return "draft";
  }
  if (request.decision === "changes-requested") {
    return "changes-requested";
  }
  return request.decision === "approved"
    ? "approved-awaiting-merge"
    : "waiting-for-review";
};

// Order matters: merged is read first.
const ENDED = [
  ["merged", "proposal-merged"],
  ["closed", "proposal-closed"],
] as const satisfies readonly (readonly [
  ReviewRequest["state"],
  ReviewStatus,
])[];

const reviewStage = (
  { trees, review }: StageInput,
  matches: SkillMatches,
): HarnessStageRead => {
  if (review.outcome === "unavailable") {
    return { outcome: "unavailable" };
  }
  if (review.outcome === "failed" || trees === null) {
    return { outcome: "unknown" };
  }
  const complete = isCompleteRead(review);
  const rows: HarnessStageRow[] = [];
  for (const skill of everySkill(trees, null)) {
    const matching = matches.get(skill) ?? [];
    const open = matching.filter((request) => request.state === "open");
    const proposal = currentProposal(trees, skill, matches, complete);
    // The branch's deletion fact and the disk's can disagree, so both travel.
    const local = {
      deletion: proposal !== null && proposal.tree === null,
      restorable: isRestorable(trees, skill),
    };
    if (open.length > 1) {
      rows.push({
        ...blankRow("pending-review", skill, "multiple-pull-requests"),
        ...local,
        requests: open.map(link),
      });
      continue;
    }
    const sole = open.length === 1 ? open[0] : undefined;
    if (sole !== undefined) {
      rows.push({
        ...blankRow("pending-review", skill, openStatus(sole)),
        ...local,
        requests: [link(sole)],
        reviewers: sole.reviewers,
      });
      continue;
    }
    if (proposal === null) {
      continue;
    }
    // Merged first: origin/HEAD lagging one read behind must not read as a
    // missing request.
    const settled = ENDED.flatMap(([state, status]) => {
      const requests = matching.filter((request) => request.state === state);
      return requests.length === 0 ? [] : [{ status, requests }];
    })[0];
    if (settled !== undefined) {
      rows.push({
        ...blankRow("pending-review", skill, settled.status),
        ...local,
        requests: settled.requests.map(link),
      });
      continue;
    }
    // A bounded read cannot prove a request absent.
    if (review.complete) {
      rows.push({
        ...blankRow("pending-review", skill, "pull-request-missing"),
        ...local,
      });
    }
  }
  return {
    outcome: "read",
    rows,
    bound: review.complete ? null : review.limit,
  };
};

const withCrossStage = (
  stages: HarnessStages,
  { review }: StageInput,
  matches: SkillMatches,
): HarnessStages => {
  const reads = [stages.proposal, stages.review, stages.release];
  const allRead = reads.every((stage) => stage.outcome === "read");
  const bounded = review.outcome === "read" && !review.complete;
  const holders = new Map<string, Set<HarnessStage>>();
  for (const stage of reads) {
    if (stage.outcome !== "read") {
      continue;
    }
    for (const row of stage.rows) {
      const held = holders.get(row.skill) ?? new Set<HarnessStage>();
      held.add(row.stage);
      holders.set(row.skill, held);
    }
  }
  const settle = (stage: HarnessStageRead): HarnessStageRead => {
    if (stage.outcome !== "read") {
      return stage;
    }
    return {
      ...stage,
      rows: stage.rows.map((row) => {
        // A bounded read proves membership only where it found a request.
        const known =
          allRead && (!bounded || (matches.get(row.skill)?.length ?? 0) > 0);
        return {
          ...row,
          alsoIn: known
            ? STAGE_ORDER.filter(
                (held) =>
                  held !== row.stage &&
                  holders.get(row.skill)?.has(held) === true,
              )
            : null,
        };
      }),
    };
  };
  return {
    proposal: settle(stages.proposal),
    review: settle(stages.review),
    release: settle(stages.release),
  };
};
