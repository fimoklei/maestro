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

// Three outcomes that must never collapse into each other.
// `read` is an answer that arrived, and `complete: false` marks one that filled
// its bound — usable, but unable to prove any request absent.
// `failed` is a read that did not answer: the cause is deliberately no more
// specific than the signal supports (ADR-0029).
// `unavailable` is no answer possible at all — no gh, no sign-in, no network,
// or a host Maestro never queries.
export type HarnessReviewRead =
  | {
      outcome: "read";
      requests: ReviewRequest[];
      complete: boolean;
      limit: number;
    }
  | { outcome: "failed" }
  | { outcome: "unavailable" };

export interface HarnessReviewPort {
  // Every request the Harness repository holds, in one call. The origin is the
  // only input: the host gate runs on it before anything is spent.
  readReviews(origin: GitOrigin): Promise<HarnessReviewRead>;
}
