// The three stages of a skill's journey, each answering its own question
// (ADR-0021 point 10). Membership is independent: one skill may hold a row in
// every stage, because its local edit, its open proposal and its merged change
// are different pieces of work.
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

// Journey order, which is also the order the cross-stage line names them in.
const STAGE_ORDER = [
  "pending-proposal",
  "pending-review",
  "pending-release",
] as const satisfies readonly HarnessStage[];

// One flat set, so a row carries one reading and the view maps it to a chip.
// A deletion keeps the same code and sets `deletion`, which is what makes a
// deletion fact per-stage rather than a relabelling of another stage's row.
type ProposalStatus = "not-yet-proposed" | "new-local-work" | "deleted-locally";

export type ReviewStatus =
  | "draft"
  | "waiting-for-review"
  | "changes-requested"
  | "approved-awaiting-merge"
  | "pull-request-missing"
  | "proposal-closed"
  | "multiple-pull-requests";

export type ReleaseStatus = "added" | "changed" | "renamed" | "deleted";

export type StageStatus = ProposalStatus | ReviewStatus | ReleaseStatus;

// Only what a link needs. The rest of a request stays behind the port.
export type ReviewRequestLink = { number: number; url: string };

// What the local content was compared against, so the stage header can name it
// without asserting a comparison that did not happen. `number` is null for a
// prepared branch nobody opened a request for.
export type ProposalComparison =
  | { kind: "proposal"; number: number | null }
  | { kind: "default-branch" };

export type HarnessStageRow = {
  stage: HarnessStage;
  skill: string;
  status: StageStatus;
  // This stage's own deletion fact. Never read across stages.
  deletion: boolean;
  // Every matching request the row can link to. More than one only under
  // `multiple-pull-requests`, where picking one would be an arbitrary choice.
  requests: ReviewRequestLink[];
  reviewers: RequestedReviewer[];
  comparison: ProposalComparison | null;
  // The other stages this skill occupies. Null where any of its memberships
  // could not be established — an unknown must never read as "only here".
  alsoIn: HarnessStage[] | null;
  concurrentChange: boolean;
  // origin/HEAD's copy of this skill: the opaque token a deletion confirmation
  // is given against (#580).
  remoteTree: string | null;
  // Pending release only: the name a renamed skill moved from.
  previousName: string | null;
};

// `bound` names the limit a read filled, so the stage can say what it saw
// rather than claim it saw everything. Null when the answer was complete.
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
  // Null where a local ref could not be read: the two local stages are then
  // unknown, never empty.
  trees: HarnessSkillTrees | null;
  atMergeBase: Record<string, string> | null;
  review: HarnessReviewRead;
  // Null where the merged delta could not be computed.
  release: SkillMovement[] | null;
};

export const buildStages = (input: StageInput): HarnessStages => {
  const release = releaseStage(input.release);
  const matches = matchRequests(input);
  const review = reviewStage(input, matches);
  const proposal = proposalStage(input, matches);
  return withCrossStage({ proposal, review, release }, input, matches);
};

// A request belongs to this Harness only when its head repository, its head
// branch and its base branch all say so. A null head repository — deleted —
// matches nothing.
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
  remoteTree: null,
  previousName: null,
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

// The proposal a skill currently has: its promote branch, while that branch is
// still a proposal. A branch whose content already reached origin/HEAD is over
// unless GitHub says a request over it is still open — comparing against a
// merged branch nobody reopened would hide the author's own work.
const currentProposal = (
  trees: HarnessSkillTrees,
  skill: string,
  matches: SkillMatches,
): { tree: string | null } | null => {
  if (!Object.hasOwn(trees.promote, skill)) {
    return null;
  }
  const tree = trees.promote[skill] ?? null;
  const unmerged = tree !== (trees.remote[skill] ?? null);
  const open = (matches.get(skill) ?? []).some(
    (request) => request.state === "open",
  );
  return unmerged || open ? { tree } : null;
};

const proposalStage = (
  { trees, atMergeBase }: StageInput,
  matches: SkillMatches,
): HarnessStageRead => {
  if (trees === null) {
    return { outcome: "unknown" };
  }
  const rows: HarnessStageRow[] = [];
  for (const skill of everySkill(trees, null)) {
    const hashes = {
      remote: trees.remote[skill] ?? null,
      promote: Object.hasOwn(trees.promote, skill)
        ? { tree: trees.promote[skill] ?? null }
        : null,
      local: trees.local[skill] ?? null,
      working: trees.working[skill] ?? null,
    };
    const proposal = currentProposal(trees, skill, matches);
    // Against a proposal, any difference is work the reviewer has not been
    // sent. Against the default branch, differing from local HEAD too is what
    // separates the author's own edit from a clone merely behind (ADR-0021).
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
      comparison:
        proposal === null
          ? { kind: "default-branch" }
          : {
              kind: "proposal",
              number: open.length === 1 ? (open[0]?.number ?? null) : null,
            },
      concurrentChange: isConcurrentlyChanged(
        hashes,
        atMergeBase === null ? undefined : (atMergeBase[skill] ?? null),
      ),
      remoteTree: hashes.remote,
    });
  }
  return { outcome: "read", rows, bound: null };
};

const openStatus = (request: ReviewRequest): ReviewStatus => {
  // Draft wins: a draft nobody can review is the fact that decides what the
  // author does next, whatever verdict an earlier review left behind.
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
  const rows: HarnessStageRow[] = [];
  for (const skill of everySkill(trees, null)) {
    const matching = matches.get(skill) ?? [];
    const open = matching.filter((request) => request.state === "open");
    const proposal = currentProposal(trees, skill, matches);
    const deletion = proposal !== null && proposal.tree === null;
    if (open.length > 1) {
      rows.push({
        ...blankRow("pending-review", skill, "multiple-pull-requests"),
        deletion,
        requests: open.map(link),
      });
      continue;
    }
    const sole = open.length === 1 ? open[0] : undefined;
    if (sole !== undefined) {
      rows.push({
        ...blankRow("pending-review", skill, openStatus(sole)),
        deletion,
        requests: [link(sole)],
        reviewers: sole.reviewers,
      });
      continue;
    }
    // No open request. Only content nobody merged is still review work: a
    // branch whose content reached origin/HEAD is over, request or not.
    if (proposal === null) {
      continue;
    }
    const closed = matching.filter((request) => request.state === "closed");
    if (closed.length > 0) {
      rows.push({
        ...blankRow("pending-review", skill, "proposal-closed"),
        deletion,
        requests: closed.map(link),
      });
      continue;
    }
    // A read that filled its bound cannot prove a request absent, so it says
    // nothing here rather than claiming one is missing (ADR-0029 point 7).
    if (review.complete) {
      rows.push({
        ...blankRow("pending-review", skill, "pull-request-missing"),
        deletion,
      });
    }
  }
  return {
    outcome: "read",
    rows,
    bound: review.complete ? null : review.limit,
  };
};

// The cross-stage line, added once every stage is built. A skill whose review
// membership could not be established gets null rather than a shorter list.
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
        // A bounded read establishes membership only where it found a request:
        // for every other skill, absence is exactly what it cannot prove.
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
