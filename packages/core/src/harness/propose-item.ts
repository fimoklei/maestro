// Proposes one item on its own branch, built on the fetched default-branch tip.
// The caller holds the per-Harness lock; the author's repository state is
// never touched.
import type { GitOrigin } from "../deploy/git-origin";
import type { HarnessFetchGate } from "./harness-fetch-gate";
import {
  type HarnessObject,
  type PrimitiveRef,
  proposalBranch,
  proposalCompareUrl,
} from "./harness-primitive";
import {
  inspectPrimitiveEntry,
  type PrimitiveEntryFs,
} from "./harness-primitive-dir";
import type { HarnessReviewPort } from "./harness-review-port";
import { isConcurrentlyChanged } from "./harness-stages";
import {
  beforeProposalPush,
  type ProposalKind,
  type PullRequestOutcome,
  readOriginFacts,
} from "./proposal-request";
import type { HarnessGitPort, WorktreeAmbiguity } from "./read-harness-state";

type ItemDeps = {
  git: HarnessGitPort;
  fetchGate: Pick<HarnessFetchGate, "fetchFresh" | "invalidate">;
  review: HarnessReviewPort;
};

type PushRefusal = "push-elsewhere" | "source-changed";

type RequestRefusal = "extra-requests" | "proposed-by-other";

export type ProposeChangeError =
  | "no-usable-origin"
  | "no-answer"
  | "skill-missing"
  // A link, or a type folder outside the Harness: pushing it would publish something else.
  | "destination-unsafe"
  // Recomputed after a fresh fetch, never from what the cockpit showed (#579).
  | "concurrent-change"
  | PushRefusal
  | RequestRefusal
  | "promote-failed";

export type ProposeDeletionError =
  | "no-usable-origin"
  | "no-answer"
  | "confirmation-stale"
  | "not-deleted"
  | WorktreeAmbiguity
  | PushRefusal
  | RequestRefusal
  | "promote-failed";

// `pullRequestUrl` is the compare page, known whether or not a request opened.
export type ProposedItem = {
  ok: true;
  branch: string;
  pullRequestUrl: string;
  pullRequest: PullRequestOutcome;
};

type Checked =
  | {
      ok: true;
      origin: GitOrigin;
      head: string;
      base: string;
      kind: Exclude<ProposalKind, "deletion">;
    }
  | { ok: false; error: ProposeChangeError };

export const proposeChange = async (
  deps: ItemDeps & { fs: PrimitiveEntryFs },
  root: string,
  ref: PrimitiveRef,
): Promise<ProposedItem | { ok: false; error: ProposeChangeError }> => {
  const entry = await inspectPrimitiveEntry(deps.fs, root, ref);
  if (entry.kind === "unsafe") {
    return { ok: false, error: "destination-unsafe" };
  }
  const outcome = await deps.fetchGate.fetchFresh(root);
  if (outcome !== "fetched") {
    return { ok: false, error: "no-answer" };
  }
  const first = await checkNotConcurrent(deps.git, root, ref);
  if (!first.ok) {
    return first;
  }

  // Re-fetched and rechecked right before the push, so a teammate's change
  // cannot slip through the gap (#579).
  const refetched = await deps.fetchGate.fetchFresh(root);
  if (refetched !== "fetched") {
    return { ok: false, error: "no-answer" };
  }
  const second = await checkNotConcurrent(deps.git, root, ref);
  if (!second.ok) {
    return second;
  }

  const target = { origin: second.origin, base: second.base, ref };
  const request = await beforeProposalPush(deps.review, target, second.kind);
  if (!request.ok) {
    return request;
  }

  const push = await deps.git.pushPromotion(
    root,
    ref,
    second.head,
    second.kind,
  );
  switch (push) {
    case "pushed":
      return await afterPushed(deps, root, target, request.afterPush);
    case "skill-missing":
    case "push-elsewhere":
    case "source-changed":
      return { ok: false, error: push };
    case "offline":
      return { ok: false, error: "no-answer" };
    case "push-failed":
      return { ok: false, error: "promote-failed" };
  }
};

// A deletion is never inferred from absence: `seenRemoteTree` is the
// confirmed default-branch content (#580).
export const proposeDeletion = async (
  deps: ItemDeps,
  root: string,
  ref: PrimitiveRef,
  seenRemoteTree: string,
): Promise<ProposedItem | { ok: false; error: ProposeDeletionError }> => {
  const outcome = await deps.fetchGate.fetchFresh(root);
  if (outcome !== "fetched") {
    return { ok: false, error: "no-answer" };
  }

  const facts = await readOriginFacts(deps.git, root);
  if (!facts.ok) {
    return facts;
  }
  const { origin, base, head } = facts;
  if (head === null) {
    return { ok: false, error: "no-answer" };
  }

  // First: an ambiguous working tree makes every fact below unreadable.
  const ambiguity = await deps.git.readWorktreeAmbiguity(root);
  if (ambiguity !== null) {
    return { ok: false, error: ambiguity };
  }

  // Re-read at the press, never taken from the row (#575).
  const local = await deps.git.readPrimitives(root, "HEAD");
  const trees = await deps.git.readMovementTrees(root);
  if (local === null || trees === null) {
    return { ok: false, error: "no-answer" };
  }
  if (
    hashOf(local, ref) === null ||
    Object.hasOwn(trees[ref.type].working, ref.name)
  ) {
    return { ok: false, error: "not-deleted" };
  }

  // From the refs just fetched: the confirmed hash may be stale.
  const remote = await deps.git.readPrimitives(root, head);
  if (remote === null) {
    return { ok: false, error: "no-answer" };
  }
  if ((hashOf(remote, ref) ?? undefined) !== seenRemoteTree) {
    return { ok: false, error: "confirmation-stale" };
  }

  const target = { origin, base, ref };
  const request = await beforeProposalPush(deps.review, target, "deletion");
  if (!request.ok) {
    return request;
  }

  const push = await deps.git.pushDeletion(root, ref, head);
  switch (push) {
    case "pushed":
      return await afterPushed(deps, root, target, request.afterPush);
    case "push-elsewhere":
    case "source-changed":
      return { ok: false, error: push };
    case "offline":
      return { ok: false, error: "no-answer" };
    case "push-failed":
      return { ok: false, error: "promote-failed" };
  }
};

const afterPushed = async (
  deps: ItemDeps,
  root: string,
  target: { origin: GitOrigin; base: string; ref: PrimitiveRef },
  afterPush: () => Promise<PullRequestOutcome>,
): Promise<ProposedItem> => {
  // The new branch reaches the clone only through a fetch.
  deps.fetchGate.invalidate(root);
  const pullRequest = await afterPush();
  return {
    ok: true,
    branch: proposalBranch(target.ref),
    pullRequestUrl: proposalCompareUrl(target.origin, target.base, target.ref),
    pullRequest,
  };
};

// Scoped to this primitive via the merge base: unrelated commits never block (#579).
const checkNotConcurrent = async (
  git: HarnessGitPort,
  root: string,
  ref: PrimitiveRef,
): Promise<Checked> => {
  const facts = await readOriginFacts(git, root);
  if (!facts.ok) {
    return facts;
  }
  const { origin, base, head } = facts;
  if (head === null) {
    return { ok: false, error: "no-answer" };
  }

  const mergeBase = await git.mergeBaseCommit(root, head);
  const [remote, local, atMergeBase] = await Promise.all([
    git.readPrimitives(root, head),
    git.readPrimitives(root, "HEAD"),
    mergeBase === null
      ? Promise.resolve(null)
      : git.readPrimitives(root, mergeBase),
  ]);
  if (remote === null || local === null) {
    return { ok: false, error: "no-answer" };
  }
  const concurrentChange = isConcurrentlyChanged(
    { remote: hashOf(remote, ref), local: hashOf(local, ref) },
    atMergeBase === null ? undefined : hashOf(atMergeBase, ref),
  );
  if (concurrentChange) {
    return { ok: false, error: "concurrent-change" };
  }
  const kind = hashOf(remote, ref) === null ? "addition" : "edit";
  return { ok: true, origin, head, base, kind };
};

const hashOf = (objects: HarnessObject[], ref: PrimitiveRef): string | null =>
  objects.find((object) => object.type === ref.type && object.name === ref.name)
    ?.hash ?? null;
