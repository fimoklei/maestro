import type { GitOrigin } from "../deploy/git-origin";

type ReviewRequestState = "open" | "closed" | "merged";

export type ReviewDecision =
  | "approved"
  | "changes-requested"
  | "review-required";

export type RequestedReviewer =
  | { kind: "user"; login: string }
  | { kind: "team"; slug: string };

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
  author: string;
  title: string;
};

export type HarnessReviewRead =
  | {
      outcome: "read";
      requests: ReviewRequest[];
      complete: boolean;
      limit: number;
    }
  | { outcome: "failed" }
  | { outcome: "unavailable"; reason: "no-gh" | "no-answer" };

export type ViewerRead =
  | { outcome: "read"; login: string }
  | { outcome: "failed" }
  | { outcome: "unavailable" };

export type PullRequestRef = { number: number; url: string };

export type ReviewFailure = { ok: false; error: "unavailable" | "failed" };

export type ReviewWriteOutcome = { ok: true } | ReviewFailure;

export type ReviewCreateOutcome =
  | ({ ok: true } & PullRequestRef)
  | ReviewFailure;

export type NewReviewRequest = {
  head: string;
  base: string;
  title: string;
  body: string;
};

export interface HarnessReviewPort {
  readReviews(origin: GitOrigin): Promise<HarnessReviewRead>;
  readViewer(origin: GitOrigin): Promise<ViewerRead>;
  createRequest(
    origin: GitOrigin,
    request: NewReviewRequest,
  ): Promise<ReviewCreateOutcome>;
  reopenRequest(origin: GitOrigin, number: number): Promise<ReviewWriteOutcome>;
  closeRequest(origin: GitOrigin, number: number): Promise<ReviewWriteOutcome>;
  editRequest(
    origin: GitOrigin,
    number: number,
    edit: { title: string },
  ): Promise<ReviewWriteOutcome>;
}

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

export const isOthers = (request: ReviewRequest, viewer: ViewerRead): boolean =>
  viewer.outcome === "read" &&
  request.author.toLowerCase() !== viewer.login.toLowerCase();

export const waitingOn = (
  open: ReviewRequest[],
  viewer: ViewerRead,
): string | null => {
  const [sole, ...rest] = open;
  return sole !== undefined && rest.length === 0 && isOthers(sole, viewer)
    ? sole.author
    : null;
};
