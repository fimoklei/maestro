// Stage membership is independent: one primitive may hold a row in every
// stage. A primitive is a type plus a name, so a skill and a prompt with one
// name never share a row, a request or an "Also in".
import type { GitOrigin } from "../deploy/git-origin";
import type { HarnessMovement } from "./harness-movements";
import {
  HARNESS_PRIMITIVE_TYPES,
  type HarnessPrimitiveType,
  type PrimitiveRef,
  primitiveKey,
  primitivePath,
  proposalBranch,
} from "./harness-primitive";
import {
  type HarnessReviewRead,
  isOthers,
  matchesProposal,
  type RequestedReviewer,
  type ReviewRequest,
  type ViewerRead,
  waitingOn,
} from "./harness-review-port";
import type { HarnessHashes, HarnessMovementTrees } from "./read-harness-state";

export type HarnessStage =
  | "pending-proposal"
  | "pending-review"
  | "pending-release";

const STAGE_ORDER = [
  "pending-proposal",
  "pending-review",
  "pending-release",
] as const satisfies readonly HarnessStage[];

type ProposalStatus = "not-yet-proposed" | "new-local-work";

type ReviewStatus =
  | "draft"
  | "waiting-for-review"
  | "changes-requested"
  | "approved-awaiting-merge"
  | "pull-request-missing"
  | "proposal-merged"
  | "proposal-closed"
  | "multiple-pull-requests"
  | "proposed-by-other";

type ReleaseStatus = "not-yet-released";

// What merging the row's change does to the Harness, judged against its
// default branch. A rename is one change only once merged; before that its
// folders read as an addition and a deletion.
export type HarnessChange = "addition" | "edit" | "deletion" | "rename";

// `null` is a skill absent at that ref; it compares like any other value.
type SkillTreeHashes = {
  /** The skill's tree at `origin/HEAD` — the merged truth. */
  remote: string | null;
  /** Its tree at local `HEAD`. */
  local: string | null;
  /** Its tree on disk, untracked files included. */
  working: string | null;
};

// Renames are not inferred: a moved directory is a deletion plus an addition (#575).
const isLocalDeletion = ({
  local,
  working,
}: Pick<SkillTreeHashes, "local" | "working">): boolean =>
  local !== null && working === null;

// Never compares the promote branch: that is the author's own proposal.
// Remote matching `atMergeBase` means only the author changed this skill (#579).
// `undefined` (merge base unreadable) falls back to the plain, safer comparison.
// Promote re-checks with it after its own fetch.
export const isConcurrentlyChanged = (
  { remote, local }: Pick<SkillTreeHashes, "remote" | "local">,
  atMergeBase: string | null | undefined,
) => remote !== local && (atMergeBase === undefined || remote !== atMergeBase);

export type StageStatus = ProposalStatus | ReviewStatus | ReleaseStatus;

export type ReviewRequestLink = {
  number: number;
  url: string;
  headBranch: string;
  baseBranch: string;
  author: string;
  // Opened by someone other than the signed-in user; false while unknown.
  byOther: boolean;
};

// `number` is null for a prepared branch nobody opened a request for.
type ProposalComparison =
  | { kind: "proposal"; number: number | null }
  | { kind: "default-branch" };

export type HarnessStageRow = {
  stage: HarnessStage;
  // The name again, until the cockpit reads `type` and `name`.
  skill: string;
  type: HarnessPrimitiveType;
  name: string;
  // The primitive's folder or file in the Harness.
  path: string;
  // Its proposal branch.
  branch: string;
  status: StageStatus;
  // This stage's own change. Never read across stages.
  change: HarnessChange;
  requests: ReviewRequestLink[];
  reviewers: RequestedReviewer[];
  comparison: ProposalComparison | null;
  // Null where any membership is unknown: an unknown must never read as "only here".
  alsoIn: HarnessStage[] | null;
  concurrentChange: boolean;
  // The other contributor whose open request every write to this skill's
  // branch waits for; null where nothing waits.
  waitingOn: string | null;
  // Only in the working tree, so a deletion is made on disk (#798).
  localOnly: boolean;
  // The token a deletion confirmation is given against (#580).
  remoteTree: string | null;
  // From the local trees alone, never from `deletion`, which a review row
  // takes from the promote branch.
  restorable: boolean;
  // The skill's folder is in the working tree, so Delete skill has something
  // to remove. False where the refs could not be read.
  folderOnDisk: boolean;
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

const RELEASE_CHANGE: Record<HarnessMovement["kind"], HarnessChange> = {
  added: "addition",
  changed: "edit",
  renamed: "rename",
  removed: "deletion",
};

const changeOf = (deletion: boolean, remote: string | null): HarnessChange => {
  if (deletion) {
    return "deletion";
  }
  return remote === null ? "addition" : "edit";
};

export type StageInput = {
  origin: GitOrigin;
  defaultBranch: string | null;
  // Null makes the two local stages unknown, never empty.
  trees: HarnessMovementTrees | null;
  // Keyed by `primitiveKey`.
  atMergeBase: Record<string, string> | null;
  review: HarnessReviewRead;
  viewer: ViewerRead;
  release: HarnessMovement[] | null;
};

export const buildStages = (input: StageInput): HarnessStages => {
  const release = releaseStage(input.release, input.trees);
  const matches = matchRequests(input);
  const review = reviewStage(input, matches);
  const proposal = proposalStage(input, matches);
  return withCrossStage({ proposal, review, release }, input, matches);
};

// Keyed by `primitiveKey`.
type Matches = Map<string, ReviewRequest[]>;

const matchRequests = ({
  origin,
  defaultBranch,
  trees,
  review,
  release,
}: StageInput): Matches => {
  const matches: Matches = new Map();
  if (review.outcome !== "read" || defaultBranch === null) {
    return matches;
  }
  for (const ref of everyPrimitive(trees, release)) {
    matches.set(
      primitiveKey(ref),
      review.requests.filter((request) =>
        matchesProposal(request, {
          ownerRepo: origin.ownerRepo,
          branch: proposalBranch(ref),
          base: defaultBranch,
        }),
      ),
    );
  }
  return matches;
};

const everyPrimitive = (
  trees: HarnessMovementTrees | null,
  release: HarnessMovement[] | null,
): PrimitiveRef[] => {
  const refs = new Map<string, PrimitiveRef>();
  const add = (ref: PrimitiveRef) =>
    refs.set(primitiveKey(ref), { type: ref.type, name: ref.name });
  if (trees !== null) {
    for (const type of HARNESS_PRIMITIVE_TYPES) {
      for (const map of Object.values(trees[type])) {
        for (const name of Object.keys(map)) {
          add({ type, name });
        }
      }
    }
  }
  for (const movement of release ?? []) {
    add(movement);
  }
  // Code-unit order by name, as the skill-only listing sorted.
  return [...refs.values()].sort((a, b) =>
    a.name === b.name
      ? a.type.localeCompare(b.type, "en")
      : a.name < b.name
        ? -1
        : 1,
  );
};

const linkFor =
  (viewer: ViewerRead) =>
  (request: ReviewRequest): ReviewRequestLink => ({
    number: request.number,
    url: request.url,
    headBranch: request.headBranch,
    baseBranch: request.baseBranch,
    author: request.author,
    byOther: isOthers(request, viewer),
  });

const openOf = (matches: Matches, ref: PrimitiveRef): ReviewRequest[] =>
  (matches.get(primitiveKey(ref)) ?? []).filter(
    (request) => request.state === "open",
  );

// A bounded read may hide a second open request, so it holds nothing.
const waitFor = (
  { review, viewer }: StageInput,
  matches: Matches,
  ref: PrimitiveRef,
): string | null =>
  isCompleteRead(review) ? waitingOn(openOf(matches, ref), viewer) : null;

const blankRow = (
  stage: HarnessStage,
  ref: PrimitiveRef,
  status: StageStatus,
  change: HarnessChange,
): HarnessStageRow => ({
  stage,
  skill: ref.name,
  type: ref.type,
  name: ref.name,
  path: primitivePath(ref),
  branch: proposalBranch(ref),
  status,
  change,
  requests: [],
  reviewers: [],
  comparison: null,
  alsoIn: null,
  concurrentChange: false,
  waitingOn: null,
  localOnly: false,
  remoteTree: null,
  restorable: false,
  folderOnDisk: false,
  previousName: null,
});

// Local places only, so every stage gives the same answer.
const isRestorable = (
  trees: HarnessMovementTrees,
  { type, name }: PrimitiveRef,
): boolean =>
  isLocalDeletion({
    local: trees[type].local[name] ?? null,
    working: trees[type].working[name] ?? null,
  });

const isOnDisk = (
  trees: HarnessMovementTrees | null,
  { type, name }: PrimitiveRef,
): boolean => trees !== null && Object.hasOwn(trees[type].working, name);

const releaseStage = (
  release: HarnessMovement[] | null,
  trees: HarnessMovementTrees | null,
): HarnessStageRead => {
  if (release === null) {
    return { outcome: "unknown" };
  }
  return {
    outcome: "read",
    bound: null,
    rows: release.map((movement) => ({
      ...blankRow(
        "pending-release",
        movement,
        "not-yet-released",
        RELEASE_CHANGE[movement.kind],
      ),
      folderOnDisk: isOnDisk(trees, movement),
      previousName: movement.previousName ?? null,
    })),
  };
};

// A branch whose tip is a merged request's head commit is spent. Without a
// review read proving that, content equal to origin/HEAD is the fallback.
// A bounded (incomplete) read proves nothing spent.
const currentProposal = (
  hashes: HarnessHashes,
  ref: PrimitiveRef,
  matches: Matches,
  completeRead: boolean,
): { tree: string | null } | null => {
  const branch = hashes.promote[ref.name];
  if (branch === undefined) {
    return null;
  }
  const { tree } = branch;
  const matching = matches.get(primitiveKey(ref)) ?? [];
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
  return tree !== (hashes.remote[ref.name] ?? null) ? { tree } : null;
};

const isCompleteRead = (review: HarnessReviewRead): boolean =>
  review.outcome === "read" && review.complete;

const proposalStage = (
  input: StageInput,
  matches: Matches,
): HarnessStageRead => {
  const { trees, atMergeBase, review } = input;
  const link = linkFor(input.viewer);
  if (trees === null) {
    return { outcome: "unknown" };
  }
  const complete = isCompleteRead(review);
  const rows: HarnessStageRow[] = [];
  for (const ref of everyPrimitive(trees, null)) {
    const typed = trees[ref.type];
    const branch = typed.promote[ref.name];
    const hashes = {
      remote: typed.remote[ref.name] ?? null,
      local: typed.local[ref.name] ?? null,
      working: typed.working[ref.name] ?? null,
    };
    const proposal = currentProposal(typed, ref, matches, complete);
    // Against the default branch, also differing from local HEAD separates an
    // own edit from a clone merely behind.
    const waiting =
      proposal === null
        ? hashes.working !== hashes.remote && hashes.working !== hashes.local
        : hashes.working !== proposal.tree;
    if (!waiting) {
      continue;
    }
    const open = openOf(matches, ref);
    // With several open requests, linking one would be arbitrary.
    const sole = open.length === 1 ? open[0] : undefined;
    rows.push({
      ...blankRow(
        "pending-proposal",
        ref,
        proposal === null ? "not-yet-proposed" : "new-local-work",
        changeOf(isLocalDeletion(hashes), hashes.remote),
      ),
      restorable: isRestorable(trees, ref),
      folderOnDisk: isOnDisk(trees, ref),
      requests: sole === undefined ? [] : [link(sole)],
      comparison:
        proposal === null
          ? { kind: "default-branch" }
          : { kind: "proposal", number: sole?.number ?? null },
      concurrentChange: isConcurrentlyChanged(
        hashes,
        atMergeBase === null
          ? undefined
          : (atMergeBase[primitiveKey(ref)] ?? null),
      ),
      waitingOn: waitFor(input, matches, ref),
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

const reviewStage = (input: StageInput, matches: Matches): HarnessStageRead => {
  const { trees, review } = input;
  const link = linkFor(input.viewer);
  if (review.outcome === "unavailable") {
    return { outcome: "unavailable" };
  }
  if (review.outcome === "failed" || trees === null) {
    return { outcome: "unknown" };
  }
  const complete = isCompleteRead(review);
  const rows: HarnessStageRow[] = [];
  for (const ref of everyPrimitive(trees, null)) {
    const typed = trees[ref.type];
    const matching = matches.get(primitiveKey(ref)) ?? [];
    const open = matching.filter((request) => request.state === "open");
    const proposal = currentProposal(typed, ref, matches, complete);
    // The branch's deletion fact and the disk's can disagree, so both travel.
    const change = changeOf(
      proposal !== null && proposal.tree === null,
      typed.remote[ref.name] ?? null,
    );
    const local = {
      restorable: isRestorable(trees, ref),
      folderOnDisk: isOnDisk(trees, ref),
    };
    if (open.length > 1) {
      rows.push({
        ...blankRow("pending-review", ref, "multiple-pull-requests", change),
        ...local,
        requests: open.map(link),
      });
      continue;
    }
    const sole = open.length === 1 ? open[0] : undefined;
    if (sole !== undefined) {
      const waiting = waitFor(input, matches, ref);
      rows.push({
        ...blankRow(
          "pending-review",
          ref,
          waiting === null ? openStatus(sole) : "proposed-by-other",
          change,
        ),
        ...local,
        requests: [link(sole)],
        reviewers: sole.reviewers,
        waitingOn: waiting,
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
        ...blankRow("pending-review", ref, settled.status, change),
        ...local,
        requests: settled.requests.map(link),
      });
      continue;
    }
    // A bounded read cannot prove a request absent.
    if (review.complete) {
      rows.push({
        ...blankRow("pending-review", ref, "pull-request-missing", change),
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
  matches: Matches,
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
      const key = primitiveKey(row);
      const held = holders.get(key) ?? new Set<HarnessStage>();
      held.add(row.stage);
      holders.set(key, held);
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
        const key = primitiveKey(row);
        const known =
          allRead && (!bounded || (matches.get(key)?.length ?? 0) > 0);
        return {
          ...row,
          alsoIn: known
            ? STAGE_ORDER.filter(
                (held) =>
                  held !== row.stage && holders.get(key)?.has(held) === true,
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
