import type { GitOrigin } from "../deploy/git-origin";
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
  type ProposalKind,
  readOriginFacts,
  requestProposal,
} from "./proposal-request";
import {
  hasValidName,
  type ProposalSubject,
  subjectBranch,
} from "./proposal-subject";
import type {
  BranchAuthorship,
  HarnessGitPort,
  WorktreeAmbiguity,
} from "./read-harness-state";
import {
  type ReplaceDeps,
  type ReplaceOutcome,
  replaceFromCommit,
} from "./replace-from-commit";

export type ProposalActionError =
  | "not-configured"
  | "invalid-skill"
  | "no-usable-origin"
  | "no-answer"
  | "review-unavailable"
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
  | "branch-by-other"
  | "commit-email-missing"
  | "branch-authors-unknown"
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
  head: string | null;
  origin: GitOrigin;
  base: string;
  matching: ReviewRequest[];
  open: ReviewRequest[];
  viewer: ViewerRead;
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
    locks: InFlightLocks;
  };

  constructor(deps: ProposalActions["deps"]) {
    this.deps = deps;
  }

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
    const pushed = await this.deps.git.readPrimitives(
      checked.root,
      `refs/remotes/origin/${proposalBranch(ref)}`,
    );
    if (pushed === null) {
      return { ok: false, error: "no-answer" };
    }
    const kind = await this.kindOf(checked, ref, pushed);
    if (kind === null) {
      return { ok: false, error: "no-answer" };
    }
    const { origin, base } = checked;
    return settle(
      await requestProposal(this.deps.review, { origin, base, ref }, kind),
    );
  }

  private async kindOf(
    checked: Ready,
    ref: PrimitiveRef,
    pushed: HarnessObject[],
  ): Promise<ProposalKind | null> {
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
    return settle(await this.deps.review.reopenRequest(checked.origin, number));
  }

  async withdraw(
    subject: ProposalSubject,
    number: number | null,
  ): Promise<WithdrawResult> {
    if (!hasValidName(subject)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () =>
      this.withdrawAt(root, subject, number),
    );
    return run.ok ? run.value : { ok: false, error: "withdraw-in-progress" };
  }

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
    subject: ProposalSubject,
    number: number | null,
  ): Promise<WithdrawResult> {
    const checked = await this.factsAt(root, subject);
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
    if (!(await this.deps.git.readPushesWhereItFetched(root))) {
      return { ok: false, error: "push-elsewhere" };
    }
    const { head } = checked;
    const atHead =
      head === null
        ? null
        : subject.type === "categories"
          ? []
          : await this.deps.git.readPrimitives(root, head);
    if (head === null || atHead === null) {
      return { ok: false, error: "no-answer" };
    }
    if (number === null) {
      const authorship = await this.deps.git.readAuthoredHere(
        root,
        subject,
        head,
      );
      if (authorship !== "own") {
        return { ok: false, error: AUTHORSHIP_ERROR[authorship] };
      }
    }
    if (subject.type !== "categories") {
      const replaced = await replaceFromCommit(this.deps, {
        root,
        commit: head,
        atCommit: atHead,
        refs: [subject],
      });
      if (replaced !== "replaced") {
        return { ok: false, error: REPLACE_ERROR[replaced] };
      }
    }
    if (number !== null) {
      const closed = await this.deps.review.closeRequest(
        checked.origin,
        number,
      );
      if (!closed.ok) {
        return { ok: false, error: "close-failed" };
      }
    }
    const deleted = await this.deps.git.deleteProposalBranch(root, subject);
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
    subject: ProposalSubject,
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
    const branch = subjectBranch(subject);
    const matching = review.requests.filter((request) =>
      matchesProposal(request, { ownerRepo: origin.ownerRepo, branch, base }),
    );
    const open = matching.filter((request) => request.state === "open");
    const viewer = await this.deps.review.readViewer(origin);
    return {
      ok: true,
      root,
      head,
      origin,
      base,
      matching,
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

const REPLACE_ERROR = {
  "destination-unsafe": "destination-unsafe",
  "destination-unreadable": "destination-unreadable",
  failed: "replace-failed",
} as const satisfies Record<Exclude<ReplaceOutcome, "replaced">, WithdrawError>;

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
