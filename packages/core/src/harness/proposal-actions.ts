// The three GitHub-only proposal mutations, each rechecked against a fresh read.
import { isValidSkillSlug } from "../deploy/package-ref";
import {
  type HarnessReviewPort,
  matchesProposal,
  type ReviewRequest,
} from "./harness-review-port";
import { promoteBranch } from "./promote-branch";
import {
  openProposals,
  type ProposalTarget,
  readOriginFacts,
  requestProposal,
} from "./proposal-request";
import type { HarnessGitPort } from "./read-harness-state";

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
  root: string;
  target: ProposalTarget;
  matching: ReviewRequest[];
  open: ReviewRequest[];
};

type CheckedFacts = Ready | { ok: false; error: ProposalActionError };

export class ProposalActions {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    git: Pick<HarnessGitPort, "readFacts" | "readSkillTrees">;
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
    if (checked.open.length > 0) {
      return { ok: false, error: "request-exists" };
    }
    // The pushed branch alone says which kind it proposes; an unread one names none.
    const pushed = await this.deps.git.readSkillTrees(
      checked.root,
      `refs/remotes/origin/${promoteBranch(name)}`,
    );
    if (pushed === null) {
      return { ok: false, error: "no-answer" };
    }
    const kind = pushed.some((skill) => skill.name === name)
      ? "change"
      : "deletion";
    return settle(
      await requestProposal(this.deps.review, checked.target, kind),
    );
  }

  async reopen(name: string, number: number): Promise<ProposalActionResult> {
    const checked = await this.checkedFacts(name);
    if (!checked.ok) {
      return checked;
    }
    // More than one open request blocks the write: reopening would add a third.
    if (checked.open.length > 1) {
      return { ok: false, error: "extra-requests" };
    }
    const closed = checked.matching.some(
      (request) => request.state === "closed" && request.number === number,
    );
    if (!closed) {
      return { ok: false, error: "request-gone" };
    }
    return settle(
      await this.deps.review.reopenRequest(checked.target.origin, number),
    );
  }

  // Leaves the remote branch and the author's files as they are.
  async withdraw(name: string, number: number): Promise<ProposalActionResult> {
    const checked = await this.checkedFacts(name);
    if (!checked.ok) {
      return checked;
    }
    if (checked.open.length > 1) {
      return { ok: false, error: "extra-requests" };
    }
    if (checked.open[0]?.number !== number) {
      return { ok: false, error: "request-gone" };
    }
    return settle(
      await this.deps.review.closeRequest(checked.target.origin, number),
    );
  }

  private async checkedFacts(name: string): Promise<CheckedFacts> {
    if (!isValidSkillSlug(name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const facts = await readOriginFacts(this.deps.git, root);
    if (!facts.ok) {
      return facts;
    }
    const { origin, base } = facts;
    const review = await this.deps.review.readReviews(origin);
    if (review.outcome === "unavailable") {
      return { ok: false, error: "review-unavailable" };
    }
    if (review.outcome === "failed" || !review.complete) {
      return { ok: false, error: "review-unknown" };
    }
    const branch = promoteBranch(name);
    const target = { origin, base, name };
    return {
      ok: true,
      root,
      target,
      matching: review.requests.filter((request) =>
        matchesProposal(request, { ownerRepo: origin.ownerRepo, branch, base }),
      ),
      open: openProposals(review.requests, target),
    };
  }
}

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
