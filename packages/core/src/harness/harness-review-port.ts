// Git says what a skill's content is; this says what the team did with it.
import type { GitOrigin } from "../deploy/git-origin";

export type ReviewRequestState = "open" | "closed" | "merged";

export type ReviewDecision =
  | "approved"
  | "changes-requested"
  | "review-required";

// A team's slug carries its organisation (`org/team`).
export type RequestedReviewer =
  | { kind: "user"; login: string }
  | { kind: "team"; slug: string };

// Head owner and repo are null when the head repository is gone.
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
  headCommit: string;
  baseBranch: string;
};

// Three outcomes that must never collapse. `complete: false` filled its bound
// and so proves nothing absent.
export type HarnessReviewRead =
  | {
      outcome: "read";
      requests: ReviewRequest[];
      complete: boolean;
      limit: number;
    }
  | { outcome: "failed" }
  | { outcome: "unavailable" };

// `failed` is GitHub refusing. Nothing GitHub said crosses.
export type ReviewWriteOutcome =
  | { ok: true }
  | { ok: false; error: "unavailable" | "failed" };

// `head` is already on the remote: no push happens here.
export type NewReviewRequest = {
  head: string;
  base: string;
  title: string;
  body: string;
};

export interface HarnessReviewPort {
  // One call for the whole Harness, never one per skill.
  readReviews(origin: GitOrigin): Promise<HarnessReviewRead>;
  createRequest(
    origin: GitOrigin,
    request: NewReviewRequest,
  ): Promise<ReviewWriteOutcome>;
  reopenRequest(origin: GitOrigin, number: number): Promise<ReviewWriteOutcome>;
  closeRequest(origin: GitOrigin, number: number): Promise<ReviewWriteOutcome>;
}

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
