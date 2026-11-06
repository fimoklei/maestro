// Carries a target's Local edits skills back through ImportSkill's update judgement (#1249).
import { join, relative } from "node:path";
import type { DeployedContentPort, DeployTarget } from "../deploy/deploy-skill";
import {
  deployTargetSubtrees,
  SUPPORTED_TOOLS,
  type SupportedTool,
} from "../deploy/deploy-tools";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import type { GlobalDeployStateReader } from "../deploy-state/deploy-state-reader";
import type { ReleaseHeadGitPort } from "../deploy-state/release-head";
import { type SameTreeFs, sameTree } from "../filesystem/same-tree";
import type { Registry } from "../registry/registry";
import type { ImportSkill, ImportSkillError } from "./import-skill";
import type { HarnessGitPort } from "./read-harness-state";
import type { HarnessSkillTree } from "./released-content";

export type LocalEditsRefusal =
  | ImportSkillError
  // ImportSkill would add a new skill: this route only replaces the Harness's own.
  | "not-an-update"
  | "unverified"
  // Execute only: the copies differ and no offered folder was selected, or a
  // folder was selected that the check did not offer.
  | "copy-not-selected"
  | "copy-not-offered"
  | "no-local-edits"
  // Execute only: flagged, and not among the skills the author chose to undo.
  | "undoes-newer-changes";

export type ImportLocalEditsInput = {
  target: DeployTarget;
  names: readonly string[];
  // The flagged names the author checked knowing the import undoes newer
  // Harness changes; any other flagged skill is refused.
  undo: readonly string[];
  // Per skill whose copies differ, the offered folder to import from.
  selected: readonly { name: string; folder: string }[];
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
  // Only on an eligible skill whose edited copies differ: each copy's folder,
  // home-relative, one of which execute must be given.
  folders?: string[];
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

type Copy = {
  copy: "local-edits" | "unverified";
  // The release the deployed copy came from.
  version: string;
  // Each tool holding a copy, with the latest release its row measures against.
  tools: { tool: SupportedTool; release: string | undefined }[];
};

type Reading = {
  target: DeployTarget;
  // What the deployed folders are relative to.
  tree: string;
  // Skills reading Local edits or Unverified, in Deploy-state's order.
  copies: Map<string, Copy>;
};

// Whether a skill's Harness copy changed since the release its copy came from.
type MovedSince = (name: string, copy: Copy) => Promise<boolean>;

type Judged =
  | { folder: string; folders?: string[]; undoesNewerSince?: string }
  | { refusal: LocalEditsRefusal };

// The check offers every differing copy; a run imports the one selected.
type Choice = { run: false } | { run: true; folder: string | undefined };

export class ImportLocalEdits {
  private readonly deps: {
    registry: Pick<Registry, "resolveRegistered">;
    // The reader Deploy-state uses, so the dialog agrees with the row.
    deployState: Pick<GlobalDeployStateReader, "read" | "readGlobal">;
    content: Pick<DeployedContentPort, "readLockfile" | "classify">;
    // Compares one skill's tool copies with each other.
    tree: SameTreeFs;
    // The global lockfile's folder; the global tree is `home`.
    globalRoot: () => string;
    home: () => string;
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
    const moved = await this.harnessMovement();
    const skills: LocalEditsSkill[] = [];
    for (const [name, copy] of reading.copies) {
      skills.push(
        outcome(
          name,
          await this.judge(reading, moved, name, copy, { run: false }),
        ),
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
    const moved = await this.harnessMovement();
    const outcomes: LocalEditsSkill[] = [];
    for (const name of input.names) {
      const copy = reading.copies.get(name);
      const judged: Judged =
        copy === undefined
          ? { refusal: "no-local-edits" }
          : await this.judge(reading, moved, name, copy, {
              run: true,
              folder: input.selected.find((pick) => pick.name === name)?.folder,
            });
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
    if (target.kind === "global") {
      return await this.readGlobal();
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
    const release = state.releaseHead?.latestRelease ?? undefined;
    const copies = new Map<string, Copy>();
    for (const primitive of state.primitives) {
      if (primitive.copy !== undefined) {
        copies.set(primitive.name, {
          copy: primitive.copy,
          version: primitive.version,
          tools: SUPPORTED_TOOLS.map((tool) => ({ tool, release })),
        });
      }
    }
    return {
      target: { kind: "repo", repoPath: registered.path },
      tree: registered.path,
      copies,
    };
  }

  // A skill reads Local edits where any Global folder's copy does.
  private async readGlobal(): Promise<Reading | { error: LocalEditsError }> {
    const state = await this.deps.deployState
      .readGlobal(this.deps.globalRoot())
      .catch(() => null);
    if (state === null || !state.ok) {
      return { error: "target-unreadable" };
    }
    if (state.pendingOperation !== undefined) {
      return { error: "unfinished-operation" };
    }
    const held = new Map<
      string,
      Pick<Copy, "tools" | "version"> & Partial<Copy>
    >();
    const release = state.releaseHead?.latestRelease ?? undefined;
    for (const folder of state.folders) {
      for (const primitive of folder.primitives) {
        const skill = held.get(primitive.name) ?? {
          tools: [],
          version: primitive.version,
        };
        skill.tools.push({ tool: folder.tool, release });
        if (primitive.copy !== undefined && skill.copy !== "local-edits") {
          skill.copy = primitive.copy;
          // The copy that is imported names the release it came from.
          skill.version = primitive.version;
        }
        held.set(primitive.name, skill);
      }
    }
    const copies = new Map<string, Copy>();
    for (const [name, { copy, version, tools }] of held) {
      if (copy !== undefined) {
        copies.set(name, { copy, version, tools });
      }
    }
    return { target: { kind: "global" }, tree: this.deps.home(), copies };
  }

  private async judge(
    reading: Reading,
    moved: MovedSince,
    name: string,
    copy: Copy,
    choice: Choice,
  ): Promise<Judged> {
    if (copy.copy === "unverified") {
      return { refusal: "unverified" };
    }
    const edited = await this.editedFolders(reading, name, copy);
    const [first, ...others] = edited;
    if (first === undefined) {
      return { refusal: "no-local-edits" };
    }
    // Identical copies are carried back as one; differing ones by selection,
    // matched against the folders computed here, never a path from the input.
    let differ = false;
    for (const other of others) {
      if (!(await sameTree(this.deps.tree, first, other))) {
        differ = true;
        break;
      }
    }
    const offered = differ
      ? edited.map((folder) => this.shown(reading, folder))
      : undefined;
    let candidates = offered === undefined ? [first] : edited;
    if (choice.run) {
      if (offered === undefined) {
        if (choice.folder !== undefined) {
          return { refusal: "copy-not-offered" };
        }
      } else {
        if (choice.folder === undefined) {
          return { refusal: "copy-not-selected" };
        }
        const picked = edited[offered.indexOf(choice.folder)];
        if (picked === undefined) {
          return { refusal: "copy-not-offered" };
        }
        candidates = [picked];
      }
    }
    // The check offers a skill where any copy could be imported.
    let refusal: LocalEditsRefusal | undefined;
    for (const source of candidates) {
      const judged = await this.judgeSource(source);
      if (judged === null) {
        const undoes = await moved(name, copy);
        return {
          folder: source,
          ...(offered === undefined ? {} : { folders: offered }),
          ...(undoes ? { undoesNewerSince: copy.version } : {}),
        };
      }
      refusal ??= judged;
    }
    return { refusal: refusal ?? "no-local-edits" };
  }

  // Null where Import skill would update the Harness's skill from this folder.
  private async judgeSource(source: string): Promise<LocalEditsRefusal | null> {
    const checked = await this.deps.importSkill.check({ source });
    if (!checked.ok) {
      return checked.error;
    }
    const { sourceBlocker, mode } = checked.check;
    if (sourceBlocker !== null) {
      return sourceBlocker;
    }
    return mode === "update" ? null : "not-an-update";
  }

  // The folder is replaced whole, so any Harness change since the deployed
  // release would be undone. Where the trees cannot be compared, only a copy
  // from the latest release counts as unmoved. The Harness is read once per
  // reading; each release's trees once per release.
  private async harnessMovement(): Promise<MovedSince> {
    const root = await this.deps.resolveRoot();
    const working =
      root === undefined
        ? undefined
        : (await this.deps.git.readMovementTrees(root).catch(() => null))?.skill
            .working;
    const released = new Map<string, Promise<HarnessSkillTree[] | null>>();
    return async (name, copy) => {
      const onLatest = copy.tools.some(
        ({ release }) => release === copy.version,
      );
      if (root === undefined || working === undefined) {
        return !onLatest;
      }
      let trees = released.get(copy.version);
      if (trees === undefined) {
        trees = this.deps.git
          .readSkillTreesAtTag(root, copy.version)
          .catch(() => null);
        released.set(copy.version, trees);
      }
      const before = (await trees)?.find(
        (skill) => skill.name === name,
      )?.treeHash;
      return before === undefined ? !onLatest : before !== working[name];
    };
  }

  // Deploy-state's reading decides the skill is edited; this only locates the
  // copies. Where no single tool's copy reads edited (one folder deleted,
  // say), every copy still present is carried to ImportSkill's judgement.
  private async editedFolders(
    reading: Reading,
    name: string,
    copy: Copy,
  ): Promise<string[]> {
    const edited: string[] = [];
    const present: string[] = [];
    const lockfile = await this.deps.content.readLockfile(reading.target);
    for (const { tool, release } of copy.tools) {
      const state = await this.deps.content
        .classify({
          target: reading.target,
          name,
          tools: [tool],
          release,
          lockfile,
        })
        .catch(() => null);
      const [subtree] = deployTargetSubtrees(name, [tool]);
      if (subtree === undefined || state === null || state === "not-deployed") {
        continue;
      }
      const folder = join(reading.tree, subtree);
      present.push(folder);
      if (state === "diverged") {
        edited.push(folder);
      }
    }
    return edited.length > 0 ? edited : present;
  }

  // `~/…` under home, else relative to the target: never absolute.
  private shown(reading: Reading, folder: string): string {
    const fromHome = relative(this.deps.home(), folder);
    return fromHome.startsWith("..")
      ? relative(reading.tree, folder)
      : `~/${fromHome}`;
  }
}

function outcome(name: string, judged: Judged): LocalEditsSkill {
  if (!("folder" in judged)) {
    return { name, refusal: judged.refusal };
  }
  const { folders, undoesNewerSince } = judged;
  return {
    name,
    refusal: null,
    ...(folders === undefined ? {} : { folders }),
    ...(undoesNewerSince === undefined ? {} : { undoesNewerSince }),
  };
}
