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
  // Git could not say what the default branch is, so nothing can be matched.
  | "no-answer"
  // No answer from GitHub is possible at all: no gh, no sign-in, no network.
  | "review-unavailable"
  // GitHub was asked and the answer cannot be trusted to be complete. Absence
  // is exactly what a bounded or failed read cannot prove (ADR-0029).
  | "review-unknown"
  // The number the row named is not the request the fresh read matches.
  | "request-gone"
  // More than one open request matches: picking one would be arbitrary.
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

  // Opening the request a prepared branch never got. Nothing is pushed, so the
  // review sees the branch as it stands and no newer local edit rides along.
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

  // Resuming the same request, which keeps its discussion. A merged one is not
  // resumable, and neither is one this skill's branch no longer owns.
  async reopen(name: string, number: number): Promise<ProposalActionResult> {
    const checked = await this.checkedFacts(name);
    if (!checked.ok) {
      return checked;
    }
    // Ambiguity blocks a write here as it does on withdrawal: reopening beside
    // two open requests would leave a third nobody asked for (gh-driver.md).
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

  // Closing the request. The remote branch and the author's files are left
  // exactly as they are — the closed proposal is what stays recoverable.
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

  // The facts every action is checked against, read fresh each time.
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
