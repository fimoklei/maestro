// Stage membership is independent: one primitive may hold a row in every
// stage. A primitive is a type plus a name, so a skill and a prompt with one
// name never share a row, a request or an "Also in".
import type { GitOrigin } from "../deploy/git-origin";
import type { SubjectMovement } from "./harness-movements";
import {
  HARNESS_PRIMITIVE_TYPES,
  type PrimitiveRef,
  primitiveKey,
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
import {
  CATEGORIES_SUBJECT,
  type ProposalSubject,
  subjectBranch,
  subjectKey,
  subjectName,
  subjectPath,
} from "./proposal-subject";
import type {
  HarnessHashes,
  HarnessMovementTrees,
  HarnessPromoteRef,
  ListProposalRefs,
} from "./read-harness-state";

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

type ReleaseMovement = SubjectMovement & { change: HarnessChange };

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
  // A primitive, or the categories list, which Pending proposal never holds.
  type: ProposalSubject["type"];
  // The list's is its type: the cockpit names it.
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
  onDisk: boolean;
  // The branch is the author's to withdraw with no open request: every commit
  // on it is theirs, and so is its newest ended request (#1639). False where
  // unread, and outside Pending review.
  ownsBranch: boolean;
  previousName: string | null;
  // Pending release only, empty elsewhere: the open pull requests for the
  // name and a rename's previous name. Null where the review read cannot
  // prove there are none.
  openRequests: number[] | null;
  // Pending release only: one of `openRequests` is another contributor's.
  openByOther: boolean;
  // Pending release only: the newest merged pull request for the item's
  // name; null where no read found one.
  mergedRequest: number | null;
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
  // Null makes Pending review unknown, never empty.
  list: ListProposalRefs | null;
  // Keyed by `primitiveKey`.
  atMergeBase: Record<string, string> | null;
  review: HarnessReviewRead;
  viewer: ViewerRead;
  release: ReleaseMovement[] | null;
};

/** What a Pending review reading needs beyond the subject's own refs. */
export type ReviewInput = Pick<
  StageInput,
  "origin" | "defaultBranch" | "review" | "viewer"
>;

export const buildStages = (input: StageInput): HarnessStages => {
  const release = releaseStage(input);
  const matches = matchRequests(input);
  const review = reviewStage(input, matches);
  const proposal = proposalStage(input, matches);
  return withCrossStage({ proposal, review, release }, input, matches);
};

// Keyed by `subjectKey`.
type Matches = Map<string, ReviewRequest[]>;

// Whether a request is the proposal of `subject` into the default branch.
const proposes =
  (origin: GitOrigin, defaultBranch: string, subject: ProposalSubject) =>
  (request: ReviewRequest): boolean =>
    matchesProposal(request, {
      ownerRepo: origin.ownerRepo,
      branch: subjectBranch(subject),
      base: defaultBranch,
    });

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
  const subjects: ProposalSubject[] = [
    ...everyPrimitive(trees, release),
    CATEGORIES_SUBJECT,
  ];
  for (const subject of subjects) {
    matches.set(
      subjectKey(subject),
      review.requests.filter(proposes(origin, defaultBranch, subject)),
    );
  }
  return matches;
};

const everyPrimitive = (
  trees: HarnessMovementTrees | null,
  release: ReleaseMovement[] | null,
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
    if (movement.type !== "categories") {
      add(movement);
    }
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

const openOf = (matches: Matches, subject: ProposalSubject): ReviewRequest[] =>
  (matches.get(subjectKey(subject)) ?? []).filter(
    (request) => request.state === "open",
  );

// A bounded read may hide a second open request, so it holds nothing.
const waitFor = (
  { review, viewer }: ReviewInput,
  matches: Matches,
  subject: ProposalSubject,
): string | null =>
  isCompleteRead(review) ? waitingOn(openOf(matches, subject), viewer) : null;

const blankRow = (
  stage: HarnessStage,
  ref: ProposalSubject,
  status: StageStatus,
  change: HarnessChange,
): HarnessStageRow => ({
  stage,
  type: ref.type,
  name: subjectName(ref),
  path: subjectPath(ref),
  branch: subjectBranch(ref),
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
  onDisk: false,
  ownsBranch: false,
  previousName: null,
  openRequests: [],
  openByOther: false,
  mergedRequest: null,
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

// The list is built from the config, never from a file in the clone.
const isOnDisk = (
  trees: HarnessMovementTrees | null,
  subject: ProposalSubject,
): boolean =>
  trees !== null &&
  subject.type !== "categories" &&
  Object.hasOwn(trees[subject.type].working, subject.name);

// Without gh no proposal can be open; any other unread answer is unknown.
const openRequestsFor = (
  { origin, defaultBranch, review, viewer }: StageInput,
  subjects: ProposalSubject[],
): Pick<HarnessStageRow, "openRequests" | "openByOther"> => {
  const unknown = { openRequests: null, openByOther: false };
  if (review.outcome === "unavailable") {
    return review.reason === "no-gh"
      ? { openRequests: [], openByOther: false }
      : unknown;
  }
  if (review.outcome === "failed" || defaultBranch === null) {
    return unknown;
  }
  const open = review.requests.filter(
    (request) =>
      request.state === "open" &&
      subjects.some((subject) =>
        proposes(origin, defaultBranch, subject)(request),
      ),
  );
  return open.length === 0 && !review.complete
    ? unknown
    : {
        openRequests: open
          .map((request) => request.number)
          .sort((a, b) => a - b),
        openByOther: open.some((request) => isOthers(request, viewer)),
      };
};

/** The highest-numbered merged request; a Pending release row names it. */
export const newestMerged = (
  matching: readonly ReviewRequest[],
): ReviewRequest | undefined =>
  matching
    .filter((request) => request.state === "merged")
    .reduce<ReviewRequest | undefined>(
      (newest, request) =>
        newest === undefined || request.number > newest.number
          ? request
          : newest,
      undefined,
    );

const mergedRequestFor = (
  { origin, defaultBranch, review }: StageInput,
  subject: ProposalSubject,
): number | null =>
  review.outcome !== "read" || defaultBranch === null
    ? null
    : (newestMerged(
        review.requests.filter(proposes(origin, defaultBranch, subject)),
      )?.number ?? null);

const releaseStage = (input: StageInput): HarnessStageRead => {
  const { release, trees } = input;
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
        movement.change,
      ),
      onDisk: isOnDisk(trees, movement),
      previousName: movement.previousName ?? null,
      ...openRequestsFor(input, [
        movement,
        ...(movement.type === "categories" ||
        movement.previousName === undefined
          ? []
          : [{ type: movement.type, name: movement.previousName }]),
      ]),
      mergedRequest: mergedRequestFor(input, movement),
    })),
  };
};

// A branch whose tip is a merged request's head commit is spent. Without a
// review read proving that, content that landed on or equals origin/HEAD is
// the fallback: a merged branch left behind after a withdrawal from release
// differs from origin/HEAD. A bounded (incomplete) read proves nothing spent.
// `remote` is the subject's object on origin/HEAD; null where absent.
const currentProposal = (
  branch: HarnessPromoteRef | undefined,
  remote: string | null,
  matching: ReviewRequest[],
  completeRead: boolean,
): { tree: string | null } | null => {
  if (branch === undefined) {
    return null;
  }
  const { tree } = branch;
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
  if (spent || branch.landed) {
    return null;
  }
  return tree !== remote ? { tree } : null;
};

// The primitive's own branch and requests, for `currentProposal`.
const primitiveProposal = (
  hashes: HarnessHashes,
  ref: PrimitiveRef,
  matches: Matches,
  completeRead: boolean,
): { tree: string | null } | null =>
  currentProposal(
    hashes.promote[ref.name],
    hashes.remote[ref.name] ?? null,
    matches.get(subjectKey(ref)) ?? [],
    completeRead,
  );

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
    const proposal = primitiveProposal(typed, ref, matches, complete);
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
      onDisk: isOnDisk(trees, ref),
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

type EndedRequest = ReviewRequest & {
  state: Exclude<ReviewRequest["state"], "open">;
};

const ENDED_STATUS = {
  merged: "proposal-merged",
  closed: "proposal-closed",
} as const satisfies Record<EndedRequest["state"], ReviewStatus>;

// The highest number is the newest request, whatever it ended as.
export const newestEnded = (
  matching: ReviewRequest[],
): EndedRequest | undefined =>
  matching
    .filter((request): request is EndedRequest => request.state !== "open")
    .reduce<EndedRequest | undefined>(
      (newest, request) =>
        newest === undefined || request.number > newest.number
          ? request
          : newest,
      undefined,
    );

// What Pending review shows for one subject; null where it holds no row.
// `proposed` is whether the subject's branch still carries a live proposal.
type ReviewReading = {
  status: ReviewStatus;
  requests: ReviewRequestLink[];
  reviewers: RequestedReviewer[];
  waitingOn: string | null;
  // The newest ended request is another contributor's.
  endedByOther: boolean;
};

const reviewReading = (
  input: ReviewInput,
  matches: Matches,
  subject: ProposalSubject,
  proposed: boolean,
): ReviewReading | null => {
  const link = linkFor(input.viewer);
  const matching = matches.get(subjectKey(subject)) ?? [];
  const open = matching.filter((request) => request.state === "open");
  const none = { reviewers: [], waitingOn: null, endedByOther: false };
  if (open.length > 1) {
    return {
      ...none,
      status: "multiple-pull-requests",
      requests: open.map(link),
    };
  }
  const sole = open.length === 1 ? open[0] : undefined;
  if (sole !== undefined) {
    const waiting = waitFor(input, matches, subject);
    return {
      ...none,
      status: waiting === null ? openStatus(sole) : "proposed-by-other",
      requests: [link(sole)],
      reviewers: sole.reviewers,
      waitingOn: waiting,
    };
  }
  if (!proposed) {
    return null;
  }
  // Any ended request holds the row: origin/HEAD lagging one read behind a
  // merge must not read as a missing request.
  const ended = newestEnded(matching);
  if (ended !== undefined) {
    return {
      ...none,
      status: ENDED_STATUS[ended.state],
      requests: [link(ended)],
      endedByOther: isOthers(ended, input.viewer),
    };
  }
  // A bounded read cannot prove a request absent.
  return isCompleteRead(input.review)
    ? { ...none, status: "pull-request-missing", requests: [] }
    : null;
};

const reviewStage = (input: StageInput, matches: Matches): HarnessStageRead => {
  const { trees, list, review } = input;
  if (review.outcome === "unavailable") {
    return { outcome: "unavailable" };
  }
  if (review.outcome === "failed" || trees === null || list === null) {
    return { outcome: "unknown" };
  }
  const complete = isCompleteRead(review);
  const rows: HarnessStageRow[] = [];
  for (const ref of everyPrimitive(trees, null)) {
    const typed = trees[ref.type];
    const proposal = primitiveProposal(typed, ref, matches, complete);
    const reading = reviewReading(input, matches, ref, proposal !== null);
    if (reading === null) {
      continue;
    }
    const { status, endedByOther, ...shown } = reading;
    rows.push({
      ...blankRow(
        "pending-review",
        ref,
        status,
        // The branch's deletion fact and the disk's can disagree, so both travel.
        changeOf(
          proposal !== null && proposal.tree === null,
          typed.remote[ref.name] ?? null,
        ),
      ),
      ...shown,
      restorable: isRestorable(trees, ref),
      onDisk: isOnDisk(trees, ref),
      ownsBranch:
        typed.promote[ref.name]?.authorship === "own" && !endedByOther,
    });
  }
  const listRow = listReviewRow(input, list);
  return {
    outcome: "read",
    rows: listRow === null ? rows : [...rows, listRow],
    bound: review.complete ? null : review.limit,
  };
};

/**
 * The Categories row under Pending review; null where it holds none. The row
 * on Categories in Settings reads the same rule, so the two never disagree.
 * The list is built from the config, never the clone, so it has no local
 * trees and never waits under Pending proposal.
 */
export const listReviewRow = (
  input: ReviewInput,
  { remote, promote }: ListProposalRefs,
): HarnessStageRow | null => {
  const subject = CATEGORIES_SUBJECT;
  const matches: Matches =
    input.review.outcome === "read" && input.defaultBranch !== null
      ? new Map([
          [
            subjectKey(subject),
            input.review.requests.filter(
              proposes(input.origin, input.defaultBranch, subject),
            ),
          ],
        ])
      : new Map();
  const proposal = currentProposal(
    promote ?? undefined,
    remote,
    matches.get(subjectKey(subject)) ?? [],
    isCompleteRead(input.review),
  );
  const reading = reviewReading(input, matches, subject, proposal !== null);
  if (reading === null) {
    return null;
  }
  const { status, endedByOther, ...shown } = reading;
  return {
    ...blankRow(
      "pending-review",
      subject,
      status,
      changeOf(proposal !== null && proposal.tree === null, remote),
    ),
    ...shown,
    ownsBranch: promote?.authorship === "own" && !endedByOther,
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
      const key = subjectKey(row);
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
        const key = subjectKey(row);
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
