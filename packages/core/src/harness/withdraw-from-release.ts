// Takes a Pending release primitive out of the next release: one commit on the
// default branch makes it equal to the latest release (#1729). The Working
// Harness is never written, so the author's copy waits under Pending proposal.
import { createHash } from "node:crypto";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import type { HarnessObject, PrimitiveRef } from "./harness-primitive";
import type { HarnessStageRow, HarnessStages } from "./harness-stages";
import { readLatestRelease } from "./latest-release";
import { withdrawalTitle } from "./proposal-request";
import type {
  HarnessFreshnessPort,
  HarnessGitPort,
  WithdrawalPushOutcome,
  WorktreeAmbiguity,
} from "./read-harness-state";

export type WithdrawFromReleaseError =
  | "not-configured"
  | "invalid-skill"
  | WorktreeAmbiguity
  | "no-answer"
  | "not-pending-release"
  // An open pull request for one of the item's names, or an unknown read.
  | "proposal-open"
  // The default branch or the latest release no longer holds what the
  // confirmation was built from.
  | "confirmation-stale"
  // The clone's HEAD is not the default branch's tip.
  | "clone-not-current"
  // The remote declined a direct push; no pull request is opened instead.
  | "push-refused"
  | "offline"
  | "push-elsewhere"
  | "withdraw-in-progress"
  | "withdraw-failed";

export type WithdrawFromReleaseCheck =
  | { ok: true; confirmation: string }
  | { ok: false; error: WithdrawFromReleaseError };

// `name` is the Pending proposal row the withdrawal leaves behind.
export type WithdrawFromReleaseResult =
  | { ok: true; name: string }
  | { ok: false; error: WithdrawFromReleaseError };

const PUSH_ERROR: Record<
  Exclude<WithdrawalPushOutcome, "pushed">,
  WithdrawFromReleaseError
> = {
  "stale-tip": "confirmation-stale",
  refused: "push-refused",
  offline: "offline",
  "push-elsewhere": "push-elsewhere",
  "clone-not-current": "clone-not-current",
  "push-failed": "withdraw-failed",
};

// Everything the confirmation is built from, read in one pass.
type WithdrawalPlan = {
  names: PrimitiveRef[];
  // The Pending proposal row the withdrawal leaves: a rename's old name.
  selected: string;
  confirmation: string;
  defaultBranch: string;
  tip: string;
  // The latest release's commit; null where none exists.
  release: string | null;
  message: string;
};

const sameRef = (a: PrimitiveRef) => (b: PrimitiveRef) =>
  a.type === b.type && a.name === b.name;

// The Change decides only the names: a rename touches its previous name too.
const namesOf = (row: HarnessStageRow): PrimitiveRef[] =>
  row.change === "rename" && row.previousName !== null
    ? [
        { type: row.type, name: row.name },
        { type: row.type, name: row.previousName },
      ]
    : [{ type: row.type, name: row.name }];

const messageOf = (row: HarnessStageRow): string => {
  const subject = withdrawalTitle(row);
  return row.mergedRequest === null
    ? subject
    : `${subject}\n\nTakes pull request #${row.mergedRequest} out of the next release.`;
};

export class WithdrawFromRelease {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    readStages: () => Promise<HarnessStages | null>;
    freshness: Pick<HarnessFreshnessPort, "read">;
    git: Pick<
      HarnessGitPort,
      | "readWorktreeAmbiguity"
      | "readFacts"
      | "readPrimitives"
      | "withdrawOnDefaultBranch"
    >;
    locks: InFlightLocks;
  };

  constructor(deps: WithdrawFromRelease["deps"]) {
    this.deps = deps;
  }

  /** The token the press must carry back. */
  async inspect(ref: PrimitiveRef): Promise<WithdrawFromReleaseCheck> {
    const root = await this.rootFor(ref);
    if (typeof root !== "string") {
      return root;
    }
    const plan = await this.readPlan(root, ref);
    return "error" in plan
      ? { ok: false, error: plan.error }
      : { ok: true, confirmation: plan.confirmation };
  }

  // Shares the harness-root lock with every other Harness write.
  async execute(
    ref: PrimitiveRef,
    confirmation: string,
  ): Promise<WithdrawFromReleaseResult> {
    const root = await this.rootFor(ref);
    if (typeof root !== "string") {
      return root;
    }
    const run = await this.deps.locks.run(root, () =>
      this.withdraw(root, ref, confirmation),
    );
    return run.ok ? run.value : { ok: false, error: "withdraw-in-progress" };
  }

  private async rootFor(
    ref: PrimitiveRef,
  ): Promise<string | { ok: false; error: WithdrawFromReleaseError }> {
    if (!isValidSkillSlug(ref.name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    return root ?? { ok: false, error: "not-configured" };
  }

  private async withdraw(
    root: string,
    ref: PrimitiveRef,
    confirmation: string,
  ): Promise<WithdrawFromReleaseResult> {
    // Re-read at the press, never taken from the request.
    const plan = await this.readPlan(root, ref);
    if ("error" in plan) {
      return { ok: false, error: plan.error };
    }
    if (plan.confirmation !== confirmation) {
      return { ok: false, error: "confirmation-stale" };
    }
    const pushed = await this.deps.git.withdrawOnDefaultBranch(root, {
      defaultBranch: plan.defaultBranch,
      tip: plan.tip,
      source: plan.release,
      refs: plan.names,
      message: plan.message,
    });
    return pushed === "pushed"
      ? { ok: true, name: plan.selected }
      : { ok: false, error: PUSH_ERROR[pushed] };
  }

  // The worktree check runs first, for the confirmation and the push alike.
  private async readPlan(
    root: string,
    ref: PrimitiveRef,
  ): Promise<WithdrawalPlan | { error: WithdrawFromReleaseError }> {
    const ambiguity = await this.deps.git.readWorktreeAmbiguity(root);
    if (ambiguity !== null) {
      return { error: ambiguity };
    }
    const stages = await this.deps.readStages();
    if (stages === null || stages.release.outcome !== "read") {
      return { error: "no-answer" };
    }
    const row = stages.release.rows.find(sameRef(ref));
    if (row === undefined) {
      return { error: "not-pending-release" };
    }
    if (row.openRequests === null || row.openRequests.length > 0) {
      return { error: "proposal-open" };
    }
    const names = namesOf(row);

    const { facts, latest } = await readLatestRelease(
      this.deps.git,
      this.deps.freshness,
      root,
    );
    const tip = facts.defaultBranchCommit;
    if (!latest.known || tip === null || facts.defaultBranch === null) {
      return { error: "no-answer" };
    }
    const held =
      latest.tag === null
        ? []
        : await this.deps.git.readPrimitives(root, latest.tag.commit);
    const atDefault = await this.deps.git.readPrimitives(root, tip);
    if (held === null || atDefault === null) {
      return { error: "no-answer" };
    }

    const hashIn = (objects: HarnessObject[], name: PrimitiveRef) =>
      objects.find(sameRef(name))?.hash ?? null;
    const seen = [
      tip,
      ...names.map((name) => [
        name.type,
        name.name,
        hashIn(held, name),
        hashIn(atDefault, name),
      ]),
    ];
    return {
      names,
      selected:
        row.change === "rename" ? (row.previousName ?? row.name) : row.name,
      confirmation: createHash("sha256")
        .update(JSON.stringify(seen))
        .digest("hex"),
      defaultBranch: facts.defaultBranch,
      tip,
      release: latest.tag === null ? null : latest.tag.commit,
      message: messageOf(row),
    };
  }
}
