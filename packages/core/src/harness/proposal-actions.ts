// The three proposal mutations, each rechecked against a fresh read.
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import {
  type HarnessObject,
  type PrimitiveRef,
  proposalBranch,
} from "./harness-primitive";
import {
  type HarnessReviewPort,
  isOthers,
  matchesProposal,
  type ReviewRequest,
  type ViewerRead,
  waitingOn,
} from "./harness-review-port";
import { newestEnded } from "./harness-stages";
import {
  openProposals,
  type ProposalKind,
  type ProposalTarget,
  readOriginFacts,
  requestProposal,
} from "./proposal-request";
import type {
  BranchAuthorship,
  HarnessGitPort,
  WorktreeAmbiguity,
} from "./read-harness-state";
import { type ReplaceDeps, replaceFromCommit } from "./replace-from-commit";

export type ProposalActionError =
  | "not-configured"
  | "invalid-skill"
  | "no-usable-origin"
  | "no-answer"
  // No gh, no sign-in, or no network.
  | "review-unavailable"
  // A bounded or failed read: it cannot prove absence.
  | "review-unknown"
  | "request-gone"
  | "extra-requests"
  | "request-exists"
  | "proposed-by-other"
  | "action-failed";

export type WithdrawError =
  | ProposalActionError
  | WorktreeAmbiguity
  | "push-elsewhere"
  | "destination-unsafe"
  | "destination-unreadable"
  | "withdraw-in-progress"
  // A commit on a branch no open request names has another author, or its
  // authors could not be read (#1639).
  | "branch-by-other"
  | "commit-email-missing"
  | "branch-authors-unknown"
  // A withdrawal stops at the step that failed; the earlier steps stay done.
  | "replace-failed"
  | "close-failed"
  | "branch-delete-failed";

export type WithdrawResult = { ok: true } | { ok: false; error: WithdrawError };

export type UnproposedFilesResult =
  | { ok: true; files: string[] }
  | { ok: false; error: "invalid-skill" | "not-configured" | "no-answer" };

export type ProposalActionResult =
  | { ok: true }
  | { ok: false; error: ProposalActionError };

type Ready = {
  ok: true;
  root: string;
  // The fetched default-branch tip; null where it could not be read.
  head: string | null;
  target: ProposalTarget;
  matching: ReviewRequest[];
  open: ReviewRequest[];
  viewer: ViewerRead;
  // The contributor whose open request holds the branch; null where none does.
  waiting: string | null;
};

type CheckedFacts = Ready | { ok: false; error: ProposalActionError };

export class ProposalActions {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: Pick<
      HarnessGitPort,
      | "readFacts"
      | "readPrimitives"
      | "readWorktreeAmbiguity"
      | "writePrimitiveInto"
      | "deleteProposalBranch"
      | "readUnproposedFiles"
      | "readPushesWhereItFetched"
      | "readAuthoredHere"
    >;
    review: HarnessReviewPort;
    fs: ReplaceDeps["fs"];
    copyFs: ReplaceDeps["copyFs"];
    // Shared with every write to the Working Harness.
    locks: InFlightLocks;
  };

  constructor(deps: ProposalActions["deps"]) {
    this.deps = deps;
  }

  // Pushes nothing: no newer local edit rides along.
  async create(ref: PrimitiveRef): Promise<ProposalActionResult> {
    const checked = await this.checkedFacts(ref);
    if (!checked.ok) {
      return checked;
    }
    if (checked.waiting !== null) {
      return { ok: false, error: "proposed-by-other" };
    }
    if (checked.open.length > 0) {
      return { ok: false, error: "request-exists" };
    }
    // The pushed branch alone says which kind it proposes; an unread one names none.
    const pushed = await this.deps.git.readPrimitives(
      checked.root,
      `refs/remotes/origin/${proposalBranch(ref)}`,
    );
    if (pushed === null) {
      return { ok: false, error: "no-answer" };
    }
    const kind = await this.kindOf(checked, pushed);
    if (kind === null) {
      return { ok: false, error: "no-answer" };
    }
    return settle(
      await requestProposal(this.deps.review, checked.target, kind),
    );
  }

  // Judged against the default branch, as the Change column is.
  private async kindOf(
    checked: Ready,
    pushed: HarnessObject[],
  ): Promise<ProposalKind | null> {
    const { ref } = checked.target;
    const holds = (objects: HarnessObject[]) =>
      objects.some(
        (object) => object.type === ref.type && object.name === ref.name,
      );
    if (!holds(pushed)) {
      return "deletion";
    }
    const remote =
      checked.head === null
        ? null
        : await this.deps.git.readPrimitives(checked.root, checked.head);
    if (remote === null) {
      return null;
    }
    return holds(remote) ? "edit" : "addition";
  }

  async reopen(
    ref: PrimitiveRef,
    number: number,
  ): Promise<ProposalActionResult> {
    const checked = await this.checkedFacts(ref);
    if (!checked.ok) {
      return checked;
    }
    // More than one open request blocks the write: reopening would add a third.
    if (checked.open.length > 1) {
      return { ok: false, error: "extra-requests" };
    }
    const closed = checked.matching.find(
      (request) => request.state === "closed" && request.number === number,
    );
    if (closed === undefined) {
      return { ok: false, error: "request-gone" };
    }
    if (checked.waiting !== null || isOthers(closed, checked.viewer)) {
      return { ok: false, error: "proposed-by-other" };
    }
    return settle(
      await this.deps.review.reopenRequest(checked.target.origin, number),
    );
  }

  // Gives the proposal up: the Working Harness takes the default branch's copy,
  // then the request closes, then the branch goes. Closing first keeps GitHub
  // from closing the request itself when the branch disappears. A null number
  // withdraws a branch with no open request, so nothing closes (#1639).
  async withdraw(
    ref: PrimitiveRef,
    number: number | null,
  ): Promise<WithdrawResult> {
    if (!isValidSkillSlug(ref.name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () =>
      this.withdrawAt(root, ref, number),
    );
    return run.ok ? run.value : { ok: false, error: "withdraw-in-progress" };
  }

  // What a withdrawal would lose, for its confirmation.
  async unproposedFiles(ref: PrimitiveRef): Promise<UnproposedFilesResult> {
    if (!isValidSkillSlug(ref.name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const files = await this.deps.git.readUnproposedFiles(root, ref);
    return files === null
      ? { ok: false, error: "no-answer" }
      : { ok: true, files };
  }

  private async withdrawAt(
    root: string,
    ref: PrimitiveRef,
    number: number | null,
  ): Promise<WithdrawResult> {
    const checked = await this.factsAt(root, ref);
    if (!checked.ok) {
      return checked;
    }
    const refused = refusesWithdrawal(checked, number);
    if (refused !== null) {
      return { ok: false, error: refused };
    }
    const ambiguity = await this.deps.git.readWorktreeAmbiguity(root);
    if (ambiguity !== null) {
      return { ok: false, error: ambiguity };
    }
    // Checked before the clone changes: the branch deletion comes last.
    if (!(await this.deps.git.readPushesWhereItFetched(root))) {
      return { ok: false, error: "push-elsewhere" };
    }
    const atHead =
      checked.head === null
        ? null
        : await this.deps.git.readPrimitives(root, checked.head);
    if (checked.head === null || atHead === null) {
      return { ok: false, error: "no-answer" };
    }
    // With no open request naming its author, the commits do (#1639).
    if (number === null) {
      const authorship = await this.deps.git.readAuthoredHere(
        root,
        ref,
        checked.head,
      );
      if (authorship !== "own") {
        return { ok: false, error: AUTHORSHIP_ERROR[authorship] };
      }
    }
    const replaced = await replaceFromCommit(this.deps, {
      root,
      commit: checked.head,
      atCommit: atHead,
      refs: [ref],
    });
    if (
      replaced === "destination-unsafe" ||
      replaced === "destination-unreadable"
    ) {
      return { ok: false, error: replaced };
    }
    if (replaced === "failed") {
      return { ok: false, error: "replace-failed" };
    }
    if (number !== null) {
      const closed = await this.deps.review.closeRequest(
        checked.target.origin,
        number,
      );
      if (!closed.ok) {
        return { ok: false, error: "close-failed" };
      }
    }
    const deleted = await this.deps.git.deleteProposalBranch(root, ref);
    return deleted === "deleted"
      ? { ok: true }
      : { ok: false, error: "branch-delete-failed" };
  }

  private async checkedFacts(ref: PrimitiveRef): Promise<CheckedFacts> {
    if (!isValidSkillSlug(ref.name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    return await this.factsAt(root, ref);
  }

  private async factsAt(
    root: string,
    ref: PrimitiveRef,
  ): Promise<CheckedFacts> {
    const facts = await readOriginFacts(this.deps.git, root);
    if (!facts.ok) {
      return facts;
    }
    const { origin, base, head } = facts;
    const review = await this.deps.review.readReviews(origin);
    if (review.outcome === "unavailable") {
      return { ok: false, error: "review-unavailable" };
    }
    if (review.outcome === "failed" || !review.complete) {
      return { ok: false, error: "review-unknown" };
    }
    const branch = proposalBranch(ref);
    const target = { origin, base, ref };
    const open = openProposals(review.requests, target);
    const viewer = await this.deps.review.readViewer(origin);
    return {
      ok: true,
      root,
      head,
      target,
      matching: review.requests.filter((request) =>
        matchesProposal(request, { ownerRepo: origin.ownerRepo, branch, base }),
      ),
      open,
      viewer,
      waiting: waitingOn(open, viewer),
    };
  }
}

const AUTHORSHIP_ERROR = {
  others: "branch-by-other",
  "no-email": "commit-email-missing",
  unknown: "branch-authors-unknown",
} as const satisfies Record<Exclude<BranchAuthorship, "own">, WithdrawError>;

// A number names the open request to close; null expects none open, and the
// branch belongs to whoever opened its newest ended request.
const refusesWithdrawal = (
  checked: Ready,
  number: number | null,
): ProposalActionError | null => {
  if (checked.open.length > 1) {
    return "extra-requests";
  }
  if (number === null) {
    if (checked.open.length > 0) {
      return "request-exists";
    }
    const ended = newestEnded(checked.matching);
    return ended !== undefined && isOthers(ended, checked.viewer)
      ? "proposed-by-other"
      : null;
  }
  if (checked.open[0]?.number !== number) {
    return "request-gone";
  }
  return checked.waiting === null ? null : "proposed-by-other";
};

const settle = (outcome: {
  ok: boolean;
  error?: "unavailable" | "failed";
}): ProposalActionResult =>
  outcome.ok
    ? { ok: true }
    : {
        ok: false,
        error:
          outcome.error === "unavailable"
            ? "review-unavailable"
            : "action-failed",
      };
