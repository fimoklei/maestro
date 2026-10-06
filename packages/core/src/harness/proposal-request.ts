// The pull-request step around a push to `maestro/<skill>`.
import { type GitOrigin, parseGitOrigin } from "../deploy/git-origin";
import {
  type HarnessReviewPort,
  matchesProposal,
  type ReviewRequest,
  type ReviewWriteOutcome,
  waitingOn,
} from "./harness-review-port";
import type { HarnessChange } from "./harness-stages";
import { promoteBranch } from "./promote-branch";
import type { HarnessFacts } from "./read-harness-state";

export type ProposalTarget = { origin: GitOrigin; base: string; name: string };

// Before merge a rename is an addition and a deletion, so no proposal is one.
export type ProposalKind = Exclude<HarnessChange, "rename">;

const TITLE_PREFIX: Record<ProposalKind, string> = {
  addition: "Add skill:",
  edit: "Edit skill:",
  deletion: "Delete skill:",
};

// Every prefix Maestro ever wrote, so a title from before the kinds still
// counts as Maestro's own words (#1399).
const OWN_PREFIXES = [...Object.values(TITLE_PREFIX), "Promote skill:"];

// Also the subject of the commit a push lands: GitHub's compare page titles a
// one-commit request by it, where no request is opened for the author.
export const proposalTitle = (name: string, kind: ProposalKind): string =>
  `${TITLE_PREFIX[kind]} ${name}`;

const proposalText = (
  name: string,
  kind: ProposalKind,
): { title: string; body: string } => ({
  title: proposalTitle(name, kind),
  body:
    kind === "deletion"
      ? `Deletes ${name} from the Harness. Targets keep the skill until each one runs Update target after the next release.`
      : "Proposed from the Maestro cockpit.",
});

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
  kind: ProposalKind,
): Promise<ReviewWriteOutcome> =>
  review.createRequest(target.origin, {
    head: promoteBranch(target.name),
    base: target.base,
    ...proposalText(target.name, kind),
  });

// Only Maestro's own title of another kind changes: any other title is
// someone's words.
const retitle = async (
  review: HarnessReviewPort,
  target: ProposalTarget,
  kind: ProposalKind,
  request: ReviewRequest,
): Promise<void> => {
  const own = OWN_PREFIXES.some((prefix) => request.title.startsWith(prefix));
  if (!own || request.title.startsWith(TITLE_PREFIX[kind])) {
    return;
  }
  // A failed retitle is not reported: the pushed branch is the truth.
  await review.editRequest(target.origin, request.number, {
    title: proposalText(target.name, kind).title,
  });
};

// Read before the push, never from the cockpit: it decides open versus update.
export const beforeProposalPush = async (
  review: HarnessReviewPort,
  target: ProposalTarget,
  kind: ProposalKind,
): Promise<
  | { ok: true; afterPush: () => Promise<void> }
  | { ok: false; error: "extra-requests" | "proposed-by-other" }
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
  if (
    open?.length === 1 &&
    waitingOn(open, await review.readViewer(target.origin)) !== null
  ) {
    return { ok: false, error: "proposed-by-other" };
  }
  return {
    ok: true,
    afterPush: async () => {
      if (open === null) {
        return;
      }
      const [only] = open;
      if (only === undefined) {
        await requestProposal(review, target, kind);
      } else {
        await retitle(review, target, kind, only);
      }
    },
  };
};
