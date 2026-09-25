// Puts one deleted skill folder back from the last local commit: no fetch, branch or push (#888).
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

  // Shares the harness-root lock with the publish path.
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

    const staged = await this.deps.git.readStagedSkillDifference(root, name);
    if (staged !== false) {
      return { ok: false, error: "staged-changes" };
    }

    // The confirmed commit, so check and write read the same one.
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
    // `describe` does not follow links: a dangling link counts as present.
    if ((await this.deps.copyFs.describe(destination)) !== null) {
      return { ok: false, error: "destination-exists" };
    }

    return await this.writeThroughStaging(root, name, head, skills);
  }

  // One rename publishes it, so an interruption leaves no half-written folder.
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
      await this.deps.copyFs.movePath(join(staging, name), destination);
      return { ok: true, name, commit };
    } catch {
      return { ok: false, error: "restore-failed" };
    } finally {
      await this.deps.copyFs.removePath(staging).catch(() => {});
    }
  }

  // Keeps an unreadable skills folder apart from one that resolves outside.
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
