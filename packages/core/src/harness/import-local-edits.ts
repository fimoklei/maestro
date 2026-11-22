import { relative, resolve } from "node:path";
import type { DeployedContentPort, DeployTarget } from "../deploy/deploy-skill";
import {
  deployTargetSubtrees,
  type GlobalLayout,
  REPO_TOOL_ROOTS,
  SUPPORTED_TOOLS,
  type SupportedTool,
  type ToolRoots,
} from "../deploy/deploy-tools";
import type { InFlightLocks } from "../deploy/in-flight-locks";
import type { GlobalDeployStateReader } from "../deploy-state/deploy-state-reader";
import type { DeployedPrimitive } from "../deploy-state/deploy-state-types";
import type { ReleaseHeadGitPort } from "../deploy-state/release-head";
import { type SameTreeFs, sameTree } from "../filesystem/same-tree";
import type { Registry } from "../registry/registry";
import type { ImportSkill, ImportSkillError } from "./import-skill";
import type { HarnessGitPort } from "./read-harness-state";
import type { HarnessSkillTree } from "./released-content";

export type LocalEditsRefusal =
  | ImportSkillError
  | "not-an-update"
  | "unverified"
  | "copy-not-selected"
  | "copy-not-offered"
  | "no-local-edits"
  | "undoes-newer-changes";

export type ImportLocalEditsInput = {
  target: DeployTarget;
  names: readonly string[];
  undo: readonly string[];
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
  folders?: string[];
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
  version: string;
  tools: { tool: SupportedTool; release: string | undefined }[];
};

type Reading = {
  target: DeployTarget;
  tree: string;
  roots: ToolRoots;
  copies: Map<string, Copy>;
};

type MovedSince = (name: string, copy: Copy) => Promise<boolean>;

type Judged =
  | { folder: string; folders?: string[]; undoesNewerSince?: string }
  | { refusal: LocalEditsRefusal };

type Choice = { run: false } | { run: true; folder: string | undefined };

export class ImportLocalEdits {
  private readonly deps: {
    registry: Pick<Registry, "resolveRegistered">;
    deployState: Pick<GlobalDeployStateReader, "read" | "readGlobal">;
    content: Pick<DeployedContentPort, "readLockfile" | "classify">;
    tree: SameTreeFs;
    globalRoot: () => string;
    home: () => string;
    globalLayout: () => GlobalLayout;
    importSkill: Pick<ImportSkill, "check" | "execute">;
    git: Pick<ReleaseHeadGitPort, "readSkillTreesAtTag"> &
      Pick<HarnessGitPort, "readMovementTrees">;
    resolveRoot: () => Promise<string | undefined>;
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
    if (state.pendingOperation !== undefined) {
      return { error: "unfinished-operation" };
    }
    const release = state.releaseHead?.latestRelease ?? undefined;
    const copies = new Map<string, Copy>();
    for (const primitive of state.primitives) {
      if (holdsWork(primitive.copy)) {
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
      roots: REPO_TOOL_ROOTS,
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
        if (holdsWork(primitive.copy) && skill.copy !== "local-edits") {
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
    return {
      target: { kind: "global" },
      tree: this.deps.home(),
      roots: this.deps.globalLayout().roots,
      copies,
    };
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

  // Where the trees cannot be compared, only a copy from the latest release
  // counts as unmoved. The Harness is read once per reading; each release's
  // trees once per release.
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
      const [subtree] = deployTargetSubtrees(name, reading.roots, [tool]);
      if (subtree === undefined || state === null || state === "not-deployed") {
        continue;
      }
      const folder = resolve(reading.tree, subtree);
      present.push(folder);
      if (state === "diverged") {
        edited.push(folder);
      }
    }
    return edited.length > 0 ? edited : present;
  }

  private shown(reading: Reading, folder: string): string {
    const fromHome = relative(this.deps.home(), folder);
    if (!fromHome.startsWith("..")) return `~/${fromHome}`;
    return reading.target.kind === "global"
      ? folder
      : relative(reading.tree, folder);
  }
}

const holdsWork = (copy: DeployedPrimitive["copy"]): copy is Copy["copy"] =>
  copy === "local-edits" || copy === "unverified";

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
