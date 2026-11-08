// Proposes several primitives in one action: each its own branch and pull
// request, in order, inside one hold of the per-Harness lock.
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import type { HarnessFetchGate } from "./harness-fetch-gate";
import { type PrimitiveRef, primitiveKey } from "./harness-primitive";
import type { PrimitiveEntryFs } from "./harness-primitive-dir";
import type { HarnessReviewPort } from "./harness-review-port";
import { type PullRequestOutcome, readOriginFacts } from "./proposal-request";
import {
  hashOf,
  type ProposeChangeError,
  type ProposeDeletionError,
  proposeChange,
  proposeDeletion,
} from "./propose-item";
import type { HarnessGitPort } from "./read-harness-state";

/**
 * One ticked item. A deletion carries the default-branch tree its
 * confirmation showed; any other item carries none.
 */
export type BatchRequest = PrimitiveRef & { seenRemoteTree?: string };

type Deletion = PrimitiveRef & { seenRemoteTree: string };

const isDeletion = (item: BatchRequest): item is Deletion =>
  item.seenRemoteTree !== undefined;

/** One item's refusal: a single proposal's own outcome, never a new kind. */
export type BatchItemError =
  | "invalid-skill"
  | ProposeChangeError
  | ProposeDeletionError;

/** A proposed item: its branch, its compare page, and its pull request. */
export type BatchProposal = PrimitiveRef & {
  branch: string;
  compareUrl: string;
  pullRequest: PullRequestOutcome;
};

/** What one item came to, handed over as soon as it finishes. */
export type BatchItemOutcome =
  | ({ ok: true } & BatchProposal)
  | (PrimitiveRef & { ok: false; error: BatchItemError });

/** The batch's end: identical failures collapse into one line. */
export type BatchReport = {
  proposed: BatchProposal[];
  failed: { error: BatchItemError; items: PrimitiveRef[] }[];
};

/** A refusal that stops the batch before any push. */
export type ProposeBatchError =
  | "not-configured"
  | "no-usable-origin"
  | "no-answer"
  | "confirmation-stale"
  | "promote-in-progress";

export type ProposeBatchResult =
  | { ok: true; report: BatchReport }
  | { ok: false; error: ProposeBatchError };

export class ProposeBatch {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: PrimitiveEntryFs;
    git: HarnessGitPort;
    fetchGate: Pick<HarnessFetchGate, "fetchFresh" | "invalidate">;
    locks: InFlightLocks;
    review: HarnessReviewPort;
  };

  constructor(deps: ProposeBatch["deps"]) {
    this.deps = deps;
  }

  // One item failing never stops the next; each keeps its own fetch and
  // re-check right before its push (#579).
  async execute(
    items: readonly BatchRequest[],
    onItem: (outcome: BatchItemOutcome) => void,
  ): Promise<ProposeBatchResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, async () => {
      const facts = await readOriginFacts(this.deps.git, root);
      if (!facts.ok && facts.error === "no-usable-origin") {
        return { ok: false as const, error: facts.error };
      }
      const refusal = await this.deletionsRefusal(root, items);
      if (refusal !== null) {
        return { ok: false as const, error: refusal };
      }
      const outcomes: BatchItemOutcome[] = [];
      for (const item of distinct(items)) {
        const outcome = await this.proposeOne(root, item);
        outcomes.push(outcome);
        onItem(outcome);
      }
      return { ok: true as const, report: reportOf(outcomes) };
    });
    return run.ok ? run.value : { ok: false, error: "promote-in-progress" };
  }

  // A deletion the default branch moved past refuses the whole batch before
  // any push. Other items never do (#580).
  private async deletionsRefusal(
    root: string,
    items: readonly BatchRequest[],
  ): Promise<"no-answer" | "confirmation-stale" | null> {
    const deletions = items.filter(isDeletion);
    if (deletions.length === 0) {
      return null;
    }
    const fetched = await this.deps.fetchGate.fetchFresh(root);
    if (fetched !== "fetched") {
      return "no-answer";
    }
    const facts = await readOriginFacts(this.deps.git, root);
    if (!facts.ok || facts.head === null) {
      return "no-answer";
    }
    const remote = await this.deps.git.readPrimitives(root, facts.head);
    if (remote === null) {
      return "no-answer";
    }
    const moved = deletions.some(
      (ref) => (hashOf(remote, ref) ?? undefined) !== ref.seenRemoteTree,
    );
    return moved ? "confirmation-stale" : null;
  }

  private async proposeOne(
    root: string,
    item: BatchRequest,
  ): Promise<BatchItemOutcome> {
    // Only type and name leave here: the outcome never echoes a tree.
    const ref: PrimitiveRef = { type: item.type, name: item.name };
    if (!isValidSkillSlug(ref.name)) {
      return { ...ref, ok: false, error: "invalid-skill" };
    }
    const result = isDeletion(item)
      ? await proposeDeletion(this.deps, root, ref, item.seenRemoteTree)
      : await proposeChange(this.deps, root, ref);
    return result.ok
      ? {
          ...ref,
          ok: true,
          branch: result.branch,
          compareUrl: result.pullRequestUrl,
          pullRequest: result.pullRequest,
        }
      : { ...ref, ok: false, error: result.error };
  }
}

// A repeated item would only push its own branch again.
const distinct = <T extends PrimitiveRef>(items: readonly T[]): T[] => {
  const seen = new Set<string>();
  return items.filter((ref) => {
    const key = primitiveKey(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const reportOf = (outcomes: readonly BatchItemOutcome[]): BatchReport => {
  const proposed: BatchProposal[] = [];
  const failed: BatchReport["failed"] = [];
  for (const outcome of outcomes) {
    if (outcome.ok) {
      const { ok: _ok, ...proposal } = outcome;
      proposed.push(proposal);
      continue;
    }
    const ref = { type: outcome.type, name: outcome.name };
    const line = failed.find((each) => each.error === outcome.error);
    if (line === undefined) {
      failed.push({ error: outcome.error, items: [ref] });
    } else {
      line.items.push(ref);
    }
  }
  return { proposed, failed };
};
