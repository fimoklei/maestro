// Puts a Not yet proposed primitive back to its default-branch copy: no
// commit, fetch or push (#1375).
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import type { CopyTreeFsPort } from "../filesystem/copy-tree-fs";
import type { PrimitiveRef } from "./harness-primitive";
import { inspectPrimitiveEntry } from "./harness-primitive-dir";
import type { HarnessStages } from "./harness-stages";
import type { HarnessGitPort, WorktreeAmbiguity } from "./read-harness-state";
import {
  type ReplaceDeps,
  type ReplaceOutcome,
  replaceFromCommit,
} from "./replace-from-commit";

export type DiscardChangeError =
  | "not-configured"
  | "invalid-skill"
  | WorktreeAmbiguity
  | "no-answer"
  | "already-proposed"
  | "nothing-to-discard"
  // The default branch no longer holds the tree the confirmation named.
  | "confirmation-stale"
  | "destination-unsafe"
  | "destination-unreadable"
  | "discard-in-progress"
  | "discard-failed";

export type DiscardChangeResult =
  | { ok: true; name: string }
  | { ok: false; error: DiscardChangeError };

const DISCARD_ERROR: Record<
  Exclude<ReplaceOutcome, "replaced">,
  DiscardChangeError
> = {
  "destination-unsafe": "destination-unsafe",
  "destination-unreadable": "destination-unreadable",
  failed: "discard-failed",
};

export class DiscardChange {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    // The stages the rows were read from: whether a change is proposed takes
    // the review read as well as the refs.
    readStages: () => Promise<HarnessStages | null>;
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
      | "writePrimitiveInto"
    >;
    locks: InFlightLocks;
  };

  constructor(deps: DiscardChange["deps"]) {
    this.deps = deps;
  }

  // Shares the harness-root lock with the publish path.
  async execute(
    ref: PrimitiveRef,
    seenRemoteTree: string,
  ): Promise<DiscardChangeResult> {
    if (!isValidSkillSlug(ref.name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () =>
      this.discard(root, ref, seenRemoteTree),
    );
    return run.ok ? run.value : { ok: false, error: "discard-in-progress" };
  }

  private async discard(
    root: string,
    ref: PrimitiveRef,
    seenRemoteTree: string,
  ): Promise<DiscardChangeResult> {
    const ambiguity = await this.deps.git.readWorktreeAmbiguity(root);
    if (ambiguity !== null) {
      return { ok: false, error: ambiguity };
    }

    // Before the rows: real git lists no link, which would read as a deletion.
    const entry = await inspectPrimitiveEntry(this.deps.fs, root, ref);
    if (entry.kind === "unsafe") {
      return { ok: false, error: "destination-unsafe" };
    }

    // Re-read at the press, never taken from the row.
    const stages = await this.deps.readStages();
    if (stages === null || stages.proposal.outcome !== "read") {
      return { ok: false, error: "no-answer" };
    }
    const isRef = (each: { type: string; name: string }) =>
      each.type === ref.type && each.name === ref.name;
    const row = stages.proposal.rows.find(isRef);
    // A pushed proposal of the folder as it is leaves no Pending proposal row,
    // only its Pending review one.
    const inReview =
      stages.review.outcome === "read" && stages.review.rows.some(isRef);
    if (row?.status === "new-local-work" || (row === undefined && inReview)) {
      return { ok: false, error: "already-proposed" };
    }
    if (row?.status !== "not-yet-proposed" || row.change === "deletion") {
      return { ok: false, error: "nothing-to-discard" };
    }
    if (row.remoteTree !== seenRemoteTree) {
      return { ok: false, error: "confirmation-stale" };
    }

    // One commit, so the check and the write read the same copy.
    const commit = (await this.deps.git.readFacts(root)).defaultBranchCommit;
    const atCommit =
      commit === null ? null : await this.deps.git.readPrimitives(root, commit);
    if (commit === null || atCommit === null) {
      return { ok: false, error: "no-answer" };
    }
    const hash = atCommit.find(isRef)?.hash;
    if (hash !== seenRemoteTree) {
      return { ok: false, error: "confirmation-stale" };
    }

    if (entry.kind === "unreadable") {
      return { ok: false, error: "destination-unreadable" };
    }
    // Off the disk when the rows were read: a deletion, which stays.
    if (entry.kind === "absent") {
      return { ok: false, error: "nothing-to-discard" };
    }
    const replaced = await replaceFromCommit(this.deps, {
      root,
      commit,
      atCommit,
      refs: [ref],
    });
    return replaced === "replaced"
      ? { ok: true, name: ref.name }
      : { ok: false, error: DISCARD_ERROR[replaced] };
  }
}
