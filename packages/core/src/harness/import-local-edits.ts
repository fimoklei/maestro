// Carries a target's Local edits skills back through ImportSkill's update judgement (#1249).
import { join } from "node:path";
import type { DeployedContentPort, DeployTarget } from "../deploy/deploy-skill";
import { deployTargetSubtrees, SUPPORTED_TOOLS } from "../deploy/deploy-tools";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import type { DeployStateReader } from "../deploy-state/deploy-state-reader";
import type { ReleaseHeadGitPort } from "../deploy-state/release-head";
import type { Registry } from "../registry/registry";
import type { ImportSkill, ImportSkillError } from "./import-skill";
import type { HarnessGitPort } from "./read-harness-state";

export type LocalEditsRefusal =
  | ImportSkillError
  // ImportSkill would add a new skill: this route only replaces the Harness's own.
  | "not-an-update"
  | "unverified"
  // ponytail: refused unread; #1256 compares the copies and carries identical ones.
  | "copies-differ"
  | "no-local-edits"
  // Execute only: flagged, and not among the skills the author chose to undo.
  | "undoes-newer-changes";

export type ImportLocalEditsInput = {
  target: DeployTarget;
  names: readonly string[];
  // The flagged names the author checked knowing the import undoes newer
  // Harness changes; any other flagged skill is refused.
  undo: readonly string[];
};

export type LocalEditsError =
  | "not-configured"
  | "repo-not-registered"
  | "unfinished-operation"
  | "target-unreadable"
  | "import-in-progress";

export type LocalEditsSkill = {
  name: string;
  refusal: LocalEditsRefusal | null;
  // Only on an eligible skill whose Harness copy changed since the release its
  // deployed copy came from: importing undoes those changes. Names that release.
  undoesNewerSince?: string;
};

export type ImportLocalEditsCheckResult =
  | { ok: true; skills: LocalEditsSkill[] }
  | { ok: false; error: LocalEditsError };

export type ImportLocalEditsResult =
  | { ok: true; outcomes: LocalEditsSkill[] }
  | { ok: false; error: LocalEditsError };

type Reading = {
  root: string;
  release: string | undefined;
  // Skills reading Local edits or Unverified, in Deploy-state's order.
  copies: Map<string, "local-edits" | "unverified">;
  // The release each skill's deployed copy came from.
  versions: Map<string, string>;
};

type Judged =
  | { folder: string; undoesNewerSince?: string }
  | { refusal: LocalEditsRefusal };

export class ImportLocalEdits {
  private readonly deps: {
    registry: Pick<Registry, "resolveRegistered">;
    // The reader Deploy-state uses, so the dialog agrees with the row.
    deployState: Pick<DeployStateReader, "read">;
    content: Pick<DeployedContentPort, "classify">;
    importSkill: Pick<ImportSkill, "check" | "execute">;
    git: Pick<ReleaseHeadGitPort, "readSkillTreesAtTag"> &
      Pick<HarnessGitPort, "readMovementTrees">;
    resolveRoot: () => Promise<string | undefined>;
    // The Harness lock Delete and Restore take.
    locks: InFlightLocks;
  };

  constructor(deps: ImportLocalEdits["deps"]) {
    this.deps = deps;
  }

  async check(target: DeployTarget): Promise<ImportLocalEditsCheckResult> {
    const reading = await this.read(target);
    if ("error" in reading) {
      return { ok: false, error: reading.error };
    }
    const skills: LocalEditsSkill[] = [];
    for (const [name, copy] of reading.copies) {
      const judged = await this.judge(reading, name, copy);
      skills.push(
        "folder" in judged
          ? { name, refusal: null, ...flag(judged) }
          : { name, refusal: judged.refusal },
      );
    }
    return { ok: true, skills };
  }

  // Judged again from scratch: the check the browser saw proves nothing.
  async execute(input: ImportLocalEditsInput): Promise<ImportLocalEditsResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () => this.land(input));
    return run.ok ? run.value : { ok: false, error: "import-in-progress" };
  }

  private async land(
    input: ImportLocalEditsInput,
  ): Promise<ImportLocalEditsResult> {
    const reading = await this.read(input.target);
    if ("error" in reading) {
      return { ok: false, error: reading.error };
    }
    const outcomes: LocalEditsSkill[] = [];
    for (const name of input.names) {
      const copy = reading.copies.get(name);
      const judged =
        copy === undefined
          ? { refusal: "no-local-edits" as const }
          : await this.judge(reading, name, copy);
      if (!("folder" in judged)) {
        outcomes.push({ name, refusal: judged.refusal });
        continue;
      }
      if (judged.undoesNewerSince !== undefined && !input.undo.includes(name)) {
        outcomes.push({ name, refusal: "undoes-newer-changes" });
        continue;
      }
      const landed = await this.deps.importSkill.execute({
        source: judged.folder,
      });
      outcomes.push({ name, refusal: landed.ok ? null : landed.error });
    }
    return { ok: true, outcomes };
  }

  private async read(
    target: DeployTarget,
  ): Promise<Reading | { error: LocalEditsError }> {
    if (target.kind !== "repo") {
      // ponytail: repository targets only; #1256 adds the global target.
      return { error: "target-unreadable" };
    }
    // Before any filesystem access.
    const registered = await this.deps.registry.resolveRegistered(
      target.repoPath,
    );
    if (registered === undefined) {
      return { error: "repo-not-registered" };
    }
    const state = await this.deps.deployState
      .read(registered.path)
      .catch(() => null);
    if (state === null || !state.ok) {
      return { error: "target-unreadable" };
    }
    // Its files may be half written.
    if (state.pendingOperation !== undefined) {
      return { error: "unfinished-operation" };
    }
    const copies = new Map<string, "local-edits" | "unverified">();
    const versions = new Map<string, string>();
    for (const primitive of state.primitives) {
      if (primitive.copy !== undefined) {
        copies.set(primitive.name, primitive.copy);
        versions.set(primitive.name, primitive.version);
      }
    }
    return {
      root: registered.path,
      release: state.releaseHead?.latestRelease ?? undefined,
      copies,
      versions,
    };
  }

  private async judge(
    reading: Reading,
    name: string,
    copy: "local-edits" | "unverified",
  ): Promise<Judged> {
    if (copy === "unverified") {
      return { refusal: "unverified" };
    }
    const folders = await this.editedFolders(reading, name);
    if (folders.length === 0) {
      return { refusal: "no-local-edits" };
    }
    if (folders.length > 1) {
      return { refusal: "copies-differ" };
    }
    const folder = folders[0] as string;
    const checked = await this.deps.importSkill.check({ source: folder });
    if (!checked.ok) {
      return { refusal: checked.error };
    }
    const { sourceBlocker, mode } = checked.check;
    if (sourceBlocker !== null) {
      return { refusal: sourceBlocker };
    }
    if (mode !== "update") {
      return { refusal: "not-an-update" };
    }
    const version = reading.versions.get(name) as string;
    return (await this.harnessMovedSince(name, version))
      ? { folder, undoesNewerSince: version }
      : { folder };
  }

  // The folder is replaced whole, so any Harness change since the deployed
  // release would be undone. An unreadable release counts as moved.
  private async harnessMovedSince(
    name: string,
    version: string,
  ): Promise<boolean> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return true;
    }
    const [released, trees] = await Promise.all([
      this.deps.git.readSkillTreesAtTag(root, version).catch(() => null),
      this.deps.git.readMovementTrees(root).catch(() => null),
    ]);
    const before = released?.find((skill) => skill.name === name)?.treeHash;
    return before === undefined || before !== trees?.working[name];
  }

  // Per tool, measured as Deploy-state measures: against the latest release.
  private async editedFolders(
    reading: Reading,
    name: string,
  ): Promise<string[]> {
    const target: DeployTarget = { kind: "repo", repoPath: reading.root };
    const folders: string[] = [];
    for (const tool of SUPPORTED_TOOLS) {
      const state = await this.deps.content
        .classify({ target, name, tools: [tool], release: reading.release })
        .catch(() => null);
      if (state === "diverged") {
        folders.push(
          ...deployTargetSubtrees(name, [tool]).map((subtree) =>
            join(reading.root, subtree),
          ),
        );
      }
    }
    return folders;
  }
}

const flag = (judged: { undoesNewerSince?: string }) =>
  judged.undoesNewerSince === undefined
    ? {}
    : { undoesNewerSince: judged.undoesNewerSince };
