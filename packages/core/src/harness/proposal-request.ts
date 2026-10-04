// The pull-request step around a push to `maestro/<skill>`.
import { type GitOrigin, parseGitOrigin } from "../deploy/git-origin";
import {
  type HarnessReviewPort,
  matchesProposal,
  type ReviewRequest,
  type ReviewWriteOutcome,
} from "./harness-review-port";
import { PROPOSAL_BODY, promoteBranch, proposalTitle } from "./promote-branch";
import type { HarnessFacts } from "./read-harness-state";

export type ProposalTarget = { origin: GitOrigin; base: string; name: string };

export type OriginFacts =
  | { ok: true; origin: GitOrigin; base: string; head: string | null }
  | { ok: false; error: "no-usable-origin" | "no-answer" };

export const readOriginFacts = async (
  git: { readFacts: (root: string) => Promise<HarnessFacts> },
  root: string,
): Promise<OriginFacts> => {
  const facts = await git.readFacts(root);
  const origin =
    facts.originUrl === null ? null : parseGitOrigin(facts.originUrl);
  if (origin === null) {
    return { ok: false, error: "no-usable-origin" };
  }
  if (facts.defaultBranch === null) {
    return { ok: false, error: "no-answer" };
  }
  return {
    ok: true,
    origin,
    base: facts.defaultBranch,
    head: facts.defaultBranchCommit,
  };
};

export const openProposals = (
  requests: ReviewRequest[],
  target: ProposalTarget,
): ReviewRequest[] =>
  requests.filter(
    (request) =>
      request.state === "open" &&
      matchesProposal(request, {
        ownerRepo: target.origin.ownerRepo,
        branch: promoteBranch(target.name),
        base: target.base,
      }),
  );

export const requestProposal = (
  review: HarnessReviewPort,
  target: ProposalTarget,
): Promise<ReviewWriteOutcome> =>
  review.createRequest(target.origin, {
    head: promoteBranch(target.name),
    base: target.base,
    title: proposalTitle(target.name),
    body: PROPOSAL_BODY,
  });

// Read before the push, never from the cockpit: it decides open versus update.
export const beforeProposalPush = async (
  review: HarnessReviewPort,
  target: ProposalTarget,
): Promise<
  | { ok: true; afterPush: () => Promise<void> }
  | { ok: false; error: "extra-requests" }
> => {
  const read = await review.readReviews(target.origin);
  // Null is "unknown", never "none": it blocks no push and opens no request.
  const open =
    read.outcome === "read" && read.complete
      ? openProposals(read.requests, target)
      : null;
  if (open !== null && open.length > 1) {
    return { ok: false, error: "extra-requests" };
  }
  return {
    ok: true,
    afterPush: async () => {
      if (open !== null && open.length === 0) {
        await requestProposal(review, target);
      }
    },
  };
};
