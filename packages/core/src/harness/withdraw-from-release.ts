// Makes a Pending release primitive in the Working Harness equal to the latest
// release: no commit, fetch, branch or push (#1642).
import { createHash } from "node:crypto";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import type { CopyTreeFsPort } from "../filesystem/copy-tree-fs";
import type { HarnessObject, PrimitiveRef } from "./harness-primitive";
import type { HarnessStageRow, HarnessStages } from "./harness-stages";
import { readLatestRelease } from "./latest-release";
import type {
  HarnessFreshnessPort,
  HarnessGitPort,
  WorktreeAmbiguity,
} from "./read-harness-state";
import {
  type ReplaceDeps,
  type ReplaceOutcome,
  replaceFromCommit,
} from "./replace-from-commit";

export type WithdrawFromReleaseError =
  | "not-configured"
  | "invalid-skill"
  | WorktreeAmbiguity
  | "no-answer"
  | "not-pending-release"
  // The Working Harness, the default branch or the latest release no longer
  // holds what the confirmation was built from.
  | "confirmation-stale"
  | "destination-unsafe"
  | "destination-unreadable"
  | "withdraw-in-progress"
  | "withdraw-failed";

export type WithdrawFromReleaseCheck =
  | { ok: true; files: string[]; confirmation: string }
  | { ok: false; error: WithdrawFromReleaseError };

// `name` is the Pending proposal row the withdrawal leaves behind.
export type WithdrawFromReleaseResult =
  | { ok: true; name: string }
  | { ok: false; error: WithdrawFromReleaseError };

const WITHDRAW_ERROR: Record<
  Exclude<ReplaceOutcome, "replaced">,
  WithdrawFromReleaseError
> = {
  "destination-unsafe": "destination-unsafe",
  "destination-unreadable": "destination-unreadable",
  failed: "withdraw-failed",
};

// Everything the confirmation is built from, read in one pass.
type Facts = {
  names: PrimitiveRef[];
  confirmation: string;
  defaultBranchCommit: string;
  // The latest release's commit and its primitives; null where none exists.
  release: { commit: string; held: HarnessObject[] } | null;
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

export class WithdrawFromRelease {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    readStages: () => Promise<HarnessStages | null>;
    freshness: Pick<HarnessFreshnessPort, "read">;
    fs: ReplaceDeps["fs"];
    copyFs: Pick<
      CopyTreeFsPort,
      "createStagingDir" | "movePath" | "removePath"
    >;
    git: Pick<
      HarnessGitPort,
      | "readWorktreeAmbiguity"
      | "readFacts"
      | "readPrimitives"
      | "readMovementTrees"
      | "readWorkingDifferences"
      | "writePrimitiveInto"
    >;
    locks: InFlightLocks;
  };

  constructor(deps: WithdrawFromRelease["deps"]) {
    this.deps = deps;
  }

  /** The files of unproposed work the withdrawal replaces, and its token. */
  async inspect(ref: PrimitiveRef): Promise<WithdrawFromReleaseCheck> {
    const root = await this.rootFor(ref);
    if (typeof root !== "string") {
      return root;
    }
    const facts = await this.readFacts(root, ref);
    if ("error" in facts) {
      return { ok: false, error: facts.error };
    }
    const files = await this.deps.git.readWorkingDifferences(
      root,
      facts.names,
      facts.defaultBranchCommit,
    );
    return files === null
      ? { ok: false, error: "no-answer" }
      : { ok: true, files, confirmation: facts.confirmation };
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
    const ambiguity = await this.deps.git.readWorktreeAmbiguity(root);
    if (ambiguity !== null) {
      return { ok: false, error: ambiguity };
    }
    // Re-read at the press, never taken from the request.
    const facts = await this.readFacts(root, ref);
    if ("error" in facts) {
      return { ok: false, error: facts.error };
    }
    if (facts.confirmation !== confirmation) {
      return { ok: false, error: "confirmation-stale" };
    }
    const replaced = await replaceFromCommit(this.deps, {
      root,
      // Never written without a release: it holds none of the names.
      commit: facts.release?.commit ?? facts.defaultBranchCommit,
      atCommit: facts.release?.held ?? [],
      refs: facts.names,
    });
    return replaced === "replaced"
      ? { ok: true, name: (facts.names.at(-1) ?? ref).name }
      : { ok: false, error: WITHDRAW_ERROR[replaced] };
  }

  private async readFacts(
    root: string,
    ref: PrimitiveRef,
  ): Promise<Facts | { error: WithdrawFromReleaseError }> {
    const stages = await this.deps.readStages();
    if (stages === null || stages.release.outcome !== "read") {
      return { error: "no-answer" };
    }
    const row = stages.release.rows.find(sameRef(ref));
    if (row === undefined) {
      return { error: "not-pending-release" };
    }
    const names = namesOf(row);

    const { facts, latest } = await readLatestRelease(
      this.deps.git,
      this.deps.freshness,
      root,
    );
    const commit = facts.defaultBranchCommit;
    if (!latest.known || commit === null) {
      return { error: "no-answer" };
    }
    const held =
      latest.tag === null
        ? []
        : await this.deps.git.readPrimitives(root, latest.tag.commit);
    const atDefault = await this.deps.git.readPrimitives(root, commit);
    const trees = await this.deps.git.readMovementTrees(root);
    if (held === null || atDefault === null || trees === null) {
      return { error: "no-answer" };
    }

    const hashIn = (objects: HarnessObject[], name: PrimitiveRef) =>
      objects.find(sameRef(name))?.hash ?? null;
    const seen = names.map((name) => [
      name.type,
      name.name,
      hashIn(held, name),
      hashIn(atDefault, name),
      trees[name.type].working[name.name] ?? null,
    ]);
    return {
      names,
      confirmation: createHash("sha256")
        .update(JSON.stringify(seen))
        .digest("hex"),
      defaultBranchCommit: commit,
      release: latest.tag === null ? null : { commit: latest.tag.commit, held },
    };
  }
}
