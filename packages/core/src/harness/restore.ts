// Puts one deleted primitive back from the last local commit: no fetch, branch or push (#888).
import { join } from "node:path";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import { isValidSkillSlug } from "../deploy/package-ref";
import type { CopyTreeFsPort } from "../filesystem/copy-tree-fs";
import { type PrimitiveRef, primitiveEntry } from "./harness-primitive";
import {
  inspectPrimitiveEntry,
  type PrimitiveEntryFs,
} from "./harness-primitive-dir";
import type { HarnessGitPort, WorktreeAmbiguity } from "./read-harness-state";

export type RestoreError =
  | "not-configured"
  | "invalid-skill"
  | WorktreeAmbiguity
  | "head-moved"
  // Also an index that could not be read: unread is never clean.
  | "staged-changes"
  | "not-in-commit"
  | "destination-exists"
  | "destination-unsafe"
  | "destination-unreadable"
  | "source-unreadable"
  | "restore-in-progress"
  | "restore-failed";

export type RestoreResult =
  | { ok: true; name: string; commit: string }
  | { ok: false; error: RestoreError };

export class Restore {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: PrimitiveEntryFs;
    copyFs: Pick<
      CopyTreeFsPort,
      "describe" | "createStagingDir" | "movePath" | "removePath"
    >;
    git: Pick<
      HarnessGitPort,
      | "readLocalHeadCommit"
      | "readStagedDifference"
      | "readPrimitives"
      | "writePrimitiveInto"
      | "readWorktreeAmbiguity"
    >;
    locks: InFlightLocks;
  };

  constructor(deps: Restore["deps"]) {
    this.deps = deps;
  }

  // Shares the harness-root lock with the publish path.
  async execute(
    ref: PrimitiveRef,
    seenHeadCommit: string,
  ): Promise<RestoreResult> {
    if (!isValidSkillSlug(ref.name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () =>
      this.put(root, ref, seenHeadCommit),
    );
    return run.ok ? run.value : { ok: false, error: "restore-in-progress" };
  }

  private async put(
    root: string,
    ref: PrimitiveRef,
    seenHeadCommit: string,
  ): Promise<RestoreResult> {
    // First: an ambiguous working tree makes every fact below unreadable.
    const ambiguity = await this.deps.git.readWorktreeAmbiguity(root);
    if (ambiguity !== null) {
      return { ok: false, error: ambiguity };
    }

    // Re-read at the press, never taken from the row.
    const head = await this.deps.git.readLocalHeadCommit(root);
    if (head === null) {
      return { ok: false, error: "restore-failed" };
    }
    if (head !== seenHeadCommit) {
      return { ok: false, error: "head-moved" };
    }

    const staged = await this.deps.git.readStagedDifference(root, ref);
    if (staged !== false) {
      return { ok: false, error: "staged-changes" };
    }

    // The confirmed commit, so check and write read the same one.
    const committed = await this.deps.git.readPrimitives(root, head);
    if (committed === null) {
      return { ok: false, error: "restore-failed" };
    }
    if (
      !committed.some(
        (object) => object.type === ref.type && object.name === ref.name,
      )
    ) {
      return { ok: false, error: "not-in-commit" };
    }

    const entry = await inspectPrimitiveEntry(this.deps.fs, root, ref);
    if (entry.kind === "unreadable") {
      return { ok: false, error: "destination-unreadable" };
    }
    // Real git lists no link, so a linked primitive reads as deleted.
    if (entry.kind === "unsafe") {
      return { ok: false, error: "destination-unsafe" };
    }
    if (entry.kind === "plain") {
      return { ok: false, error: "destination-exists" };
    }

    return await this.writeThroughStaging(root, ref, head, entry.dir);
  }

  // One rename publishes it, so an interruption leaves nothing half-written.
  private async writeThroughStaging(
    root: string,
    ref: PrimitiveRef,
    commit: string,
    dir: string,
  ): Promise<RestoreResult> {
    const destination = join(dir, primitiveEntry(ref));
    let staging: string;
    try {
      staging = await this.deps.copyFs.createStagingDir(dir);
    } catch {
      return { ok: false, error: "restore-failed" };
    }
    try {
      const written = await this.deps.git.writePrimitiveInto(
        root,
        ref,
        commit,
        staging,
      );
      // The trees just named it, so `missing` means unreadable, not uncommitted.
      if (written === "missing") {
        return { ok: false, error: "source-unreadable" };
      }
      if (written !== "written") {
        return { ok: false, error: "restore-failed" };
      }
      // Read again as late as possible: a concurrent creation must be kept.
      if ((await this.deps.copyFs.describe(destination)) !== null) {
        return { ok: false, error: "destination-exists" };
      }
      await this.deps.copyFs.movePath(
        join(staging, primitiveEntry(ref)),
        destination,
      );
      return { ok: true, name: ref.name, commit };
    } catch {
      return { ok: false, error: "restore-failed" };
    } finally {
      await this.deps.copyFs.removePath(staging).catch(() => {});
    }
  }
}
