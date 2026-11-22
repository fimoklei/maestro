import { createHash } from "node:crypto";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import type { HarnessStageRow, HarnessStages } from "./harness-stages";
import { readLatestRelease } from "./latest-release";
import { withdrawalTitle } from "./proposal-request";
import {
  CATEGORIES_SUBJECT,
  hasValidName,
  type ProposalSubject,
  subjectKey,
  subjectName,
} from "./proposal-subject";
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
  | "proposal-open"
  | "confirmation-stale"
  | "clone-not-current"
  | "push-refused"
  | "offline"
  | "push-elsewhere"
  | "withdraw-in-progress"
  | "withdraw-failed";

export type WithdrawFromReleaseCheck =
  | { ok: true; confirmation: string }
  | { ok: false; error: WithdrawFromReleaseError };

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

type WithdrawalPlan = {
  names: ProposalSubject[];
  selected: string;
  confirmation: string;
  defaultBranch: string;
  tip: string;
  release: string | null;
  message: string;
};

const sameRef =
  (a: ProposalSubject) =>
  (b: { type: string; name: string }): boolean =>
    a.type === b.type && subjectName(a) === b.name;

const namesOf = (row: HarnessStageRow): ProposalSubject[] => {
  if (row.type === "categories") {
    return [CATEGORIES_SUBJECT];
  }
  return row.change === "rename" && row.previousName !== null
    ? [
        { type: row.type, name: row.name },
        { type: row.type, name: row.previousName },
      ]
    : [{ type: row.type, name: row.name }];
};

const messageOf = (row: HarnessStageRow): string => {
  const subject =
    row.type === "categories"
      ? LIST_WITHDRAWAL_TITLE
      : withdrawalTitle({ type: row.type, name: row.name });
  return row.mergedRequest === null
    ? subject
    : `${subject}\n\nTakes pull request #${row.mergedRequest} out of the next release.`;
};

const LIST_WITHDRAWAL_TITLE = "Withdraw Harness categories";

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
      | "readListHash"
      | "withdrawOnDefaultBranch"
    >;
    locks: InFlightLocks;
  };

  constructor(deps: WithdrawFromRelease["deps"]) {
    this.deps = deps;
  }

  async inspect(subject: ProposalSubject): Promise<WithdrawFromReleaseCheck> {
    const root = await this.rootFor(subject);
    if (typeof root !== "string") {
      return root;
    }
    const plan = await this.readPlan(root, subject);
    return "error" in plan
      ? { ok: false, error: plan.error }
      : { ok: true, confirmation: plan.confirmation };
  }

  async execute(
    subject: ProposalSubject,
    confirmation: string,
  ): Promise<WithdrawFromReleaseResult> {
    const root = await this.rootFor(subject);
    if (typeof root !== "string") {
      return root;
    }
    const run = await this.deps.locks.run(root, () =>
      this.withdraw(root, subject, confirmation),
    );
    return run.ok ? run.value : { ok: false, error: "withdraw-in-progress" };
  }

  private async rootFor(
    subject: ProposalSubject,
  ): Promise<string | { ok: false; error: WithdrawFromReleaseError }> {
    if (!hasValidName(subject)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    return root ?? { ok: false, error: "not-configured" };
  }

  private async withdraw(
    root: string,
    subject: ProposalSubject,
    confirmation: string,
  ): Promise<WithdrawFromReleaseResult> {
    const plan = await this.readPlan(root, subject);
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

  private async readPlan(
    root: string,
    subject: ProposalSubject,
  ): Promise<WithdrawalPlan | { error: WithdrawFromReleaseError }> {
    const ambiguity = await this.deps.git.readWorktreeAmbiguity(root);
    if (ambiguity !== null) {
      return { error: ambiguity };
    }
    const stages = await this.deps.readStages();
    if (stages === null || stages.release.outcome !== "read") {
      return { error: "no-answer" };
    }
    const row = stages.release.rows.find(sameRef(subject));
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
    const release = latest.tag === null ? null : latest.tag.commit;
    const held = await this.hashes(root, release, names);
    const atDefault = await this.hashes(root, tip, names);
    if (held === null || atDefault === null) {
      return { error: "no-answer" };
    }
    const seen = [
      tip,
      ...names.map((name, at) => [
        subjectKey(name),
        held[at] ?? null,
        atDefault[at] ?? null,
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
      release,
      message: messageOf(row),
    };
  }

  private async hashes(
    root: string,
    ref: string | null,
    names: ProposalSubject[],
  ): Promise<(string | null)[] | null> {
    if (ref === null) {
      return names.map(() => null);
    }
    const primitives = names.some((name) => name.type !== "categories")
      ? await this.deps.git.readPrimitives(root, ref)
      : [];
    if (primitives === null) {
      return null;
    }
    const out: (string | null)[] = [];
    for (const name of names) {
      if (name.type === "categories") {
        const list = await this.deps.git.readListHash(root, ref, name);
        if (list === null) {
          return null;
        }
        out.push(list.hash);
      } else {
        out.push(primitives.find(sameRef(name))?.hash ?? null);
      }
    }
    return out;
  }
}
