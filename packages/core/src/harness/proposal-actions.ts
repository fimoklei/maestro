// The three GitHub-only proposal mutations, each rechecked against a fresh read.
import { parseGitOrigin } from "../deploy/git-origin";
import {
  type HarnessReviewPort,
  matchesProposal,
  type ReviewRequest,
} from "./harness-review-port";
import {
  isPromotableSkillName,
  PROPOSAL_BODY,
  promoteBranch,
  proposalTitle,
} from "./promote-branch";
import type { HarnessFacts } from "./read-harness-state";

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
  | "action-failed";

export type ProposalActionResult =
  | { ok: true }
  | { ok: false; error: ProposalActionError };

type Ready = {
  ok: true;
  origin: NonNullable<ReturnType<typeof parseGitOrigin>>;
  base: string;
  branch: string;
  matching: ReviewRequest[];
};

type CheckedFacts = Ready | { ok: false; error: ProposalActionError };

export class ProposalActions {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: { readFacts: (root: string) => Promise<HarnessFacts> };
    review: HarnessReviewPort;
  };

  constructor(deps: ProposalActions["deps"]) {
    this.deps = deps;
  }

  // Pushes nothing: no newer local edit rides along.
  async create(name: string): Promise<ProposalActionResult> {
    const checked = await this.checkedFacts(name);
    if (!checked.ok) {
      return checked;
    }
    if (openOf(checked.matching).length > 0) {
      return { ok: false, error: "request-exists" };
    }
    return settle(
      await this.deps.review.createRequest(checked.origin, {
        head: checked.branch,
        base: checked.base,
        title: proposalTitle(name),
        body: PROPOSAL_BODY,
      }),
    );
  }

  async reopen(name: string, number: number): Promise<ProposalActionResult> {
    const checked = await this.checkedFacts(name);
    if (!checked.ok) {
      return checked;
    }
    if (openOf(checked.matching).length > 1) {
      return { ok: false, error: "extra-requests" };
    }
    const closed = checked.matching.some(
      (request) => request.state === "closed" && request.number === number,
    );
    if (!closed) {
      return { ok: false, error: "request-gone" };
    }
    return settle(await this.deps.review.reopenRequest(checked.origin, number));
  }

  // Leaves the remote branch and the author's files as they are.
  async withdraw(name: string, number: number): Promise<ProposalActionResult> {
    const checked = await this.checkedFacts(name);
    if (!checked.ok) {
      return checked;
    }
    const open = openOf(checked.matching);
    if (open.length > 1) {
      return { ok: false, error: "extra-requests" };
    }
    if (open[0]?.number !== number) {
      return { ok: false, error: "request-gone" };
    }
    return settle(await this.deps.review.closeRequest(checked.origin, number));
  }

  private async checkedFacts(name: string): Promise<CheckedFacts> {
    if (!isPromotableSkillName(name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const facts = await this.deps.git.readFacts(root);
    const origin =
      facts.originUrl === null ? null : parseGitOrigin(facts.originUrl);
    if (origin === null) {
      return { ok: false, error: "no-usable-origin" };
    }
    const base = facts.defaultBranch;
    if (base === null) {
      return { ok: false, error: "no-answer" };
    }
    const review = await this.deps.review.readReviews(origin);
    if (review.outcome === "unavailable") {
      return { ok: false, error: "review-unavailable" };
    }
    if (review.outcome === "failed" || !review.complete) {
      return { ok: false, error: "review-unknown" };
    }
    const branch = promoteBranch(name);
    return {
      ok: true,
      origin,
      base,
      branch,
      matching: review.requests.filter((request) =>
        matchesProposal(request, { ownerRepo: origin.ownerRepo, branch, base }),
      ),
    };
  }
}

const openOf = (requests: ReviewRequest[]) =>
  requests.filter((request) => request.state === "open");

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
