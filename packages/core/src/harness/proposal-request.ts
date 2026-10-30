// The pull-request step around a push to a primitive's proposal branch.
import { type GitOrigin, parseGitOrigin } from "../deploy/git-origin";
import {
  type HarnessPrimitiveType,
  type PrimitiveRef,
  proposalBranch,
} from "./harness-primitive";
import {
  type HarnessReviewPort,
  matchesProposal,
  type ReviewRequest,
  type ReviewWriteOutcome,
  waitingOn,
} from "./harness-review-port";
import type { HarnessChange } from "./harness-stages";
import type { HarnessFacts } from "./read-harness-state";

export type ProposalTarget = {
  origin: GitOrigin;
  base: string;
  ref: PrimitiveRef;
};

// Before merge a rename is an addition and a deletion, so no proposal is one.
export type ProposalKind = Exclude<HarnessChange, "rename">;

const TITLE_PREFIX: Record<
  HarnessPrimitiveType,
  Record<ProposalKind, string>
> = {
  skill: {
    addition: "Add skill:",
    edit: "Edit skill:",
    deletion: "Delete skill:",
  },
  prompt: {
    addition: "Add prompt:",
    edit: "Edit prompt:",
    deletion: "Delete prompt:",
  },
};

// Every prefix Maestro ever wrote, so a title from before the kinds still
// counts as Maestro's own words (#1399).
const OWN_PREFIXES = [
  ...Object.values(TITLE_PREFIX).flatMap((byKind) => Object.values(byKind)),
  "Promote skill:",
];

// The subject of the commit that takes a primitive out of the next release.
const WITHDRAW_PREFIX: Record<HarnessPrimitiveType, string> = {
  skill: "Withdraw skill:",
  prompt: "Withdraw prompt:",
};

export const withdrawalTitle = (ref: PrimitiveRef): string =>
  `${WITHDRAW_PREFIX[ref.type]} ${ref.name}`;

// Also the subject of the commit a push lands: GitHub's compare page titles a
// one-commit request by it, where no request is opened for the author.
export const proposalTitle = (ref: PrimitiveRef, kind: ProposalKind): string =>
  `${TITLE_PREFIX[ref.type][kind]} ${ref.name}`;

// A prompt deploys to no target, so its deletion body names none.
const DELETION_AFTERWORD: Record<HarnessPrimitiveType, string> = {
  skill:
    " Targets keep the skill until each one runs Update target after the next release.",
  prompt: "",
};

const proposalText = (
  ref: PrimitiveRef,
  kind: ProposalKind,
): { title: string; body: string } => ({
  title: proposalTitle(ref, kind),
  body:
    kind === "deletion"
      ? `Deletes ${ref.name} from the Harness.${DELETION_AFTERWORD[ref.type]}`
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
        branch: proposalBranch(target.ref),
        base: target.base,
      }),
  );

export const requestProposal = (
  review: HarnessReviewPort,
  target: ProposalTarget,
  kind: ProposalKind,
): Promise<ReviewWriteOutcome> =>
  review.createRequest(target.origin, {
    head: proposalBranch(target.ref),
    base: target.base,
    ...proposalText(target.ref, kind),
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
  if (!own || request.title.startsWith(TITLE_PREFIX[target.ref.type][kind])) {
    return;
  }
  // A failed retitle is not reported: the pushed branch is the truth.
  await review.editRequest(target.origin, request.number, {
    title: proposalText(target.ref, kind).title,
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
