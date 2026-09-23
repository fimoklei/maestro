// Putting one deleted skill folder back from the clone's last local commit, and
// nothing after it: no fetch, no branch, no push, no proposal. The recovery
// exception to "authors edit folders outside the cockpit" (ADR-0030, #888).
import { join } from "node:path";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import type { CopyTreeFsPort } from "../filesystem/copy-tree-fs";
import { isWithinRoot } from "../filesystem/path-containment";
import { HARNESS_SKILLS_DIR } from "../inventory/harness-layout";
import type { FileSystemPort } from "../registry/file-system";
import { isPromotableSkillName } from "./promote-branch";
import type { HarnessGitPort, WorktreeAmbiguity } from "./read-harness-state";

export type RestoreSkillError =
  | "not-configured"
  | "invalid-skill"
  // A working tree that is mid-rewrite, conflicted or incomplete by design
  // answers for no author's intent, so each ambiguity arrives under its own
  // name — the same four the deletion route refuses under (#580).
  | WorktreeAmbiguity
  // Local HEAD moved after the confirmation read it, so the committed copy is
  // no longer the one the author approved.
  | "head-moved"
  // This skill has a staged edit or a staged deletion. Maestro never touches
  // the real index, so the author unstages it first (ADR-0030). A question
  // that could not be asked lands here too: an unread index is not a clean one.
  | "staged-changes"
  // The confirmed commit does not hold this skill: there is nothing to restore.
  | "not-in-commit"
  // Something already sits at the destination — a folder, a file or a link.
  // Read again immediately before the move, so a folder created meanwhile is
  // kept rather than replaced.
  | "destination-exists"
  // The skills folder does not resolve inside the Harness (security.md).
  | "destination-unsafe"
  // The skills folder could not be read at all — it is gone, or the read
  // failed. Absent is an answer the destination gives; unreadable is none,
  // and an unread destination is never a free one.
  | "destination-unreadable"
  // git could no longer resolve the subtree the commit's own trees just
  // named. A read that broke is never proof the skill was not committed.
  | "source-unreadable"
  | "restore-in-progress"
  | "restore-failed";

export type RestoreSkillResult =
  | { ok: true; name: string; commit: string }
  | { ok: false; error: RestoreSkillError };

export class RestoreSkill {
  private readonly deps: {
    resolveRoot: () => Promise<string | undefined>;
    fs: Pick<FileSystemPort, "realpath">;
    copyFs: Pick<
      CopyTreeFsPort,
      "describe" | "createStagingDir" | "movePath" | "removePath"
    >;
    // The local half of the harness git only: this writes nothing remote, so
    // it never fetches and never depends on GitHub answering (ADR-0029).
    git: Pick<
      HarnessGitPort,
      | "readLocalHeadCommit"
      | "readStagedSkillDifference"
      | "readSkillTrees"
      | "writeSkillTreeInto"
      | "readWorktreeAmbiguity"
    >;
    locks: InFlightLocks;
  };

  constructor(deps: RestoreSkill["deps"]) {
    this.deps = deps;
  }

  // Shares the harness-root lock the publish path takes: a restoration beside
  // a push would answer for a working tree the other is reading.
  async execute(
    name: string,
    seenHeadCommit: string,
  ): Promise<RestoreSkillResult> {
    if (!isPromotableSkillName(name)) {
      return { ok: false, error: "invalid-skill" };
    }
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () =>
      this.put(root, name, seenHeadCommit),
    );
    return run.ok ? run.value : { ok: false, error: "restore-in-progress" };
  }

  private async put(
    root: string,
    name: string,
    seenHeadCommit: string,
  ): Promise<RestoreSkillResult> {
    // Asked before anything else, as the deletion route asks it: every fact
    // below is read out of a working tree, and one of these makes the whole
    // tree unable to answer.
    const ambiguity = await this.deps.git.readWorktreeAmbiguity(root);
    if (ambiguity !== null) {
      return { ok: false, error: ambiguity };
    }

    // Every fact re-read at the press, never taken from the row: HEAD, the
    // index and the folder all move while a confirmation stands open.
    const head = await this.deps.git.readLocalHeadCommit(root);
    if (head === null) {
      return { ok: false, error: "restore-failed" };
    }
    if (head !== seenHeadCommit) {
      return { ok: false, error: "head-moved" };
    }

    const staged = await this.deps.git.readStagedSkillDifference(root, name);
    if (staged !== false) {
      return { ok: false, error: "staged-changes" };
    }

    // Asked of the exact commit the confirmation named, so what is checked for
    // and what is written can never be two different commits.
    const committed = await this.deps.git.readSkillTrees(root, head);
    if (committed === null) {
      return { ok: false, error: "restore-failed" };
    }
    if (!committed.some((tree) => tree.name === name)) {
      return { ok: false, error: "not-in-commit" };
    }

    const skills = await this.resolveSkillsDir(root);
    if (typeof skills !== "string") {
      return { ok: false, error: skills.error };
    }
    const destination = join(skills, name);
    // `describe` never follows a trailing link, so an empty folder, a file and
    // a dangling link are all something already there.
    if ((await this.deps.copyFs.describe(destination)) !== null) {
      return { ok: false, error: "destination-exists" };
    }

    return await this.writeThroughStaging(root, name, head, skills);
  }

  // Built beside the destination and published with one rename, so an
  // interrupted restoration leaves no half-written folder behind.
  private async writeThroughStaging(
    root: string,
    name: string,
    commit: string,
    skills: string,
  ): Promise<RestoreSkillResult> {
    const destination = join(skills, name);
    let staging: string;
    try {
      staging = await this.deps.copyFs.createStagingDir(skills);
    } catch {
      return { ok: false, error: "restore-failed" };
    }
    try {
      const written = await this.deps.git.writeSkillTreeInto(
        root,
        name,
        commit,
        staging,
      );
      // `missing` here contradicts the commit's own trees, read a moment ago:
      // the subtree stopped being readable, which is never a skill that was
      // never committed.
      if (written === "missing") {
        return { ok: false, error: "source-unreadable" };
      }
      if (written !== "written") {
        return { ok: false, error: "restore-failed" };
      }
      // Read again as late as possible: the window between the first look and
      // this move is where a concurrent creation lands.
      if ((await this.deps.copyFs.describe(destination)) !== null) {
        return { ok: false, error: "destination-exists" };
      }
      await this.deps.copyFs.movePath(join(staging, name), destination);
      return { ok: true, name, commit };
    } catch {
      return { ok: false, error: "restore-failed" };
    } finally {
      // Only this attempt's own directory, whatever happened above.
      await this.deps.copyFs.removePath(staging).catch(() => {});
    }
  }

  // The deletion side's guard, read the other way round: the skills directory
  // must resolve inside the harness before anything is written into it. A path
  // that leads out and a path that cannot be read are told apart, so a missing
  // skills folder is never reported as an unsafe one.
  private async resolveSkillsDir(
    root: string,
  ): Promise<string | { error: RestoreSkillError }> {
    let realRoot: string;
    let skills: string;
    try {
      realRoot = await this.deps.fs.realpath(root);
      skills = await this.deps.fs.realpath(join(root, HARNESS_SKILLS_DIR));
    } catch {
      return { error: "destination-unreadable" };
    }
    return isWithinRoot(skills, realRoot)
      ? skills
      : { error: "destination-unsafe" };
  }
}
