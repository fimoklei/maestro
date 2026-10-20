// Puts a Not yet proposed primitive back to its default-branch copy: no
// commit, fetch or push (#1375).
import { dirname, join } from "node:path";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import type { CopyTreeFsPort } from "../filesystem/copy-tree-fs";
import type { FileSystemPort } from "../registry/file-system";
import { type PrimitiveRef, primitiveEntry } from "./harness-primitive";
import { resolveHarnessPrimitiveDir } from "./harness-primitive-dir";
import type { HarnessStages } from "./harness-stages";
import type { HarnessGitPort, WorktreeAmbiguity } from "./read-harness-state";

export type DiscardSkillChangeError =
  | "not-configured"
  | "invalid-skill"
  | WorktreeAmbiguity
  | "no-answer"
  | "already-proposed"
  | "nothing-to-discard"
  // The default branch no longer holds the tree the confirmation named.
  | "confirmation-stale"
  | "destination-unsafe"
  | "discard-in-progress"
  | "discard-failed";

export type DiscardSkillChangeResult =
  | { ok: true; name: string }
  | { ok: false; error: DiscardSkillChangeError };

export class DiscardSkillChange {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    // The stages the rows were read from: whether a change is proposed takes
    // the review read as well as the refs.
    readStages: () => Promise<HarnessStages | null>;
    fs: Pick<FileSystemPort, "realpath">;
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

  constructor(deps: DiscardSkillChange["deps"]) {
    this.deps = deps;
  }

  // Shares the harness-root lock with the publish path.
  async execute(
    ref: PrimitiveRef,
    seenRemoteTree: string,
  ): Promise<DiscardSkillChangeResult> {
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
  ): Promise<DiscardSkillChangeResult> {
    const ambiguity = await this.deps.git.readWorktreeAmbiguity(root);
    if (ambiguity !== null) {
      return { ok: false, error: ambiguity };
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

    const target = await this.resolveTarget(root, ref);
    if (target === null) {
      return { ok: false, error: "destination-unsafe" };
    }
    return await this.swap(root, ref, commit, target);
  }

  // Both moves are renames within the type's folder, so the primitive is never
  // half-written, and a failed second move puts the edited one back.
  private async swap(
    root: string,
    ref: PrimitiveRef,
    commit: string,
    target: string,
  ): Promise<DiscardSkillChangeResult> {
    let staging: string;
    try {
      staging = await this.deps.copyFs.createStagingDir(dirname(target));
    } catch {
      return { ok: false, error: "discard-failed" };
    }
    const discarded = join(staging, "discarded");
    try {
      const written = await this.deps.git.writePrimitiveInto(
        root,
        ref,
        commit,
        staging,
      );
      if (written !== "written") {
        return { ok: false, error: "discard-failed" };
      }
      await this.deps.copyFs.movePath(target, discarded);
      try {
        await this.deps.copyFs.movePath(
          join(staging, primitiveEntry(ref)),
          target,
        );
      } catch {
        await this.deps.copyFs.movePath(discarded, target);
        return { ok: false, error: "discard-failed" };
      }
      return { ok: true, name: ref.name };
    } catch {
      return { ok: false, error: "discard-failed" };
    } finally {
      await this.deps.copyFs.removePath(staging).catch(() => {});
    }
  }

  // A link resolves elsewhere: replacing it would touch another tree.
  private async resolveTarget(
    root: string,
    ref: PrimitiveRef,
  ): Promise<string | null> {
    const resolved = await resolveHarnessPrimitiveDir(
      this.deps.fs,
      root,
      ref.type,
    );
    if (!resolved.ok) {
      return null;
    }
    const target = join(resolved.dir, primitiveEntry(ref));
    try {
      return (await this.deps.fs.realpath(target)) === target ? target : null;
    } catch {
      return null;
    }
  }
}
