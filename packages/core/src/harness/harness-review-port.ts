// What GitHub knows about the Harness's proposals. Git says what a skill's
// content is; this says what the team did with it (ADR-0029). One read answers
// the whole Harness — never one per skill.
import type { GitOrigin } from "../deploy/git-origin";

export type ReviewRequestState = "open" | "closed" | "merged";

// GitHub's own verdict, or null while nobody has given one. Null is never
// "approved" and never "no reviewer was asked".
export type ReviewDecision =
  | "approved"
  | "changes-requested"
  | "review-required";

// A team's slug carries its organisation (`org/team`), so both kinds name a
// reviewer the author can read back on GitHub.
export type RequestedReviewer =
  | { kind: "user"; login: string }
  | { kind: "team"; slug: string };

// The head fields are the matching keys: a proposal is this Harness's only when
// the request's head repository and branch and its base branch all say so. They
// are null when the head repository is gone, which matches nothing.
export type ReviewRequest = {
  number: number;
  url: string;
  state: ReviewRequestState;
  draft: boolean;
  decision: ReviewDecision | null;
  reviewers: RequestedReviewer[];
  headOwner: string | null;
  headRepo: string | null;
  headBranch: string;
  baseBranch: string;
};

// Three outcomes that must never collapse: an answer that arrived (`complete:
// false` marks one that filled its bound and so proves nothing absent), a read
// that did not answer, and no answer being possible at all (ADR-0029).
export type HarnessReviewRead =
  | {
      outcome: "read";
      requests: ReviewRequest[];
      complete: boolean;
      limit: number;
    }
  | { outcome: "failed" }
  | { outcome: "unavailable" };

// A write either happened or it did not. `unavailable` is the same "no answer
// possible" class the read has; `failed` is GitHub refusing, which is also what
// an unreopenable request looks like. Nothing GitHub said crosses (ADR-0029).
export type ReviewWriteOutcome =
  | { ok: true }
  | { ok: false; error: "unavailable" | "failed" };

// What a new request is opened over. The head branch is the skill's own
// proposal branch, already on the remote: no push happens here.
export type NewReviewRequest = {
  head: string;
  base: string;
  title: string;
  body: string;
};

export interface HarnessReviewPort {
  // Every request the Harness repository holds, in one call. The origin is the
  // only input: the host gate runs on it before anything is spent.
  readReviews(origin: GitOrigin): Promise<HarnessReviewRead>;
  createRequest(
    origin: GitOrigin,
    request: NewReviewRequest,
  ): Promise<ReviewWriteOutcome>;
  reopenRequest(origin: GitOrigin, number: number): Promise<ReviewWriteOutcome>;
  closeRequest(origin: GitOrigin, number: number): Promise<ReviewWriteOutcome>;
}

// A request belongs to one skill's proposal only when its head repository, head
// branch and base branch all say so; a null head repository matches nothing.
// Shared by the stage read and every mutation's recheck.
export const matchesProposal = (
  request: ReviewRequest,
  target: { ownerRepo: string; branch: string; base: string },
): boolean => {
  const [owner, repo] = target.ownerRepo.split("/");
  return (
    request.headOwner === owner &&
    request.headRepo === repo &&
    request.headBranch === target.branch &&
    request.baseBranch === target.base
  );
};
