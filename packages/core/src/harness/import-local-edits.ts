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
import { type SameTreeFs, sameTree } from "../filesystem/same-tree";
import type { Registry } from "../registry/registry";
import type { ImportSkill, ImportSkillError } from "./import-skill";

export type LocalEditsRefusal =
  | ImportSkillError
  // ImportSkill would add a new skill: this route only replaces the Harness's own.
  | "not-an-update"
  | "unverified"
  | "copies-differ"
  | "no-local-edits";

export type LocalEditsError =
  | "not-configured"
  | "repo-not-registered"
  | "unfinished-operation"
  | "target-unreadable"
  | "import-in-progress";

// Home-relative, never absolute: the refusal's sentence names them.
export type DifferingFolders = { claude: string; codex: string };

export type LocalEditsSkill = {
  name: string;
  refusal: LocalEditsRefusal | null;
  // With `copies-differ` only.
  folders?: DifferingFolders;
};

export type ImportLocalEditsCheckResult =
  | { ok: true; skills: LocalEditsSkill[] }
  | { ok: false; error: LocalEditsError };

export type ImportLocalEditsResult =
  | { ok: true; outcomes: LocalEditsSkill[] }
  | { ok: false; error: LocalEditsError };

type Copy = {
  copy: "local-edits" | "unverified";
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

type Judged =
  | { folder: string }
  | { refusal: LocalEditsRefusal; folders?: DifferingFolders };

export class ImportLocalEdits {
  private readonly deps: {
    registry: Pick<Registry, "resolveRegistered">;
    // The reader Deploy-state uses, so the dialog agrees with the row.
    deployState: Pick<GlobalDeployStateReader, "read" | "readGlobal">;
    content: Pick<DeployedContentPort, "classify">;
    // Compares one skill's tool copies with each other.
    tree: SameTreeFs;
    // The global lockfile's folder; the global tree is `home`.
    globalRoot: () => string;
    home: () => string;
    importSkill: Pick<ImportSkill, "check" | "execute">;
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
      skills.push(outcome(name, await this.judge(reading, name, copy)));
    }
    return { ok: true, skills };
  }

  // Judged again from scratch: the check the browser saw proves nothing.
  async execute(input: {
    target: DeployTarget;
    names: readonly string[];
  }): Promise<ImportLocalEditsResult> {
    const root = await this.deps.resolveRoot();
    if (root === undefined) {
      return { ok: false, error: "not-configured" };
    }
    const run = await this.deps.locks.run(root, () => this.land(input));
    return run.ok ? run.value : { ok: false, error: "import-in-progress" };
  }

  private async land(input: {
    target: DeployTarget;
    names: readonly string[];
  }): Promise<ImportLocalEditsResult> {
    const reading = await this.read(input.target);
    if ("error" in reading) {
      return { ok: false, error: reading.error };
    }
    const outcomes: LocalEditsSkill[] = [];
    for (const name of input.names) {
      const copy = reading.copies.get(name);
      const judged: Judged =
        copy === undefined
          ? { refusal: "no-local-edits" }
          : await this.judge(reading, name, copy);
      if (!("folder" in judged)) {
        outcomes.push(outcome(name, judged));
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

  // One row per detected tool; a skill reads Local edits where any tool's does.
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
    const held = new Map<string, Pick<Copy, "tools"> & Partial<Copy>>();
    for (const group of state.tools) {
      const release = group.releaseHead?.latestRelease ?? undefined;
      for (const primitive of group.primitives) {
        const skill = held.get(primitive.name) ?? { tools: [] };
        skill.tools.push({ tool: group.tool, release });
        if (primitive.copy !== undefined && skill.copy !== "local-edits") {
          skill.copy = primitive.copy;
        }
        held.set(primitive.name, skill);
      }
    }
    const copies = new Map<string, Copy>();
    for (const [name, { copy, tools }] of held) {
      if (copy !== undefined) {
        copies.set(name, { copy, tools });
      }
    }
    return { target: { kind: "global" }, tree: this.deps.home(), copies };
  }

  private async judge(
    reading: Reading,
    name: string,
    copy: Copy,
  ): Promise<Judged> {
    if (copy.copy === "unverified") {
      return { refusal: "unverified" };
    }
    const edited = await this.editedFolders(reading, name, copy);
    const first = edited.claude ?? edited.codex;
    if (first === undefined) {
      return { refusal: "no-local-edits" };
    }
    // Identical copies are carried back as one.
    if (
      edited.claude !== undefined &&
      edited.codex !== undefined &&
      !(await sameTree(this.deps.tree, edited.claude, edited.codex))
    ) {
      return {
        refusal: "copies-differ",
        folders: {
          claude: this.shown(reading, edited.claude),
          codex: this.shown(reading, edited.codex),
        },
      };
    }
    const checked = await this.deps.importSkill.check({ source: first });
    if (!checked.ok) {
      return { refusal: checked.error };
    }
    const { sourceBlocker, mode } = checked.check;
    if (sourceBlocker !== null) {
      return { refusal: sourceBlocker };
    }
    return mode === "update" ? { folder: first } : { refusal: "not-an-update" };
  }

  // Per tool, measured as Deploy-state measures: against the latest release.
  private async editedFolders(
    reading: Reading,
    name: string,
    copy: Copy,
  ): Promise<Partial<Record<SupportedTool, string>>> {
    const folders: Partial<Record<SupportedTool, string>> = {};
    for (const { tool, release } of copy.tools) {
      const state = await this.deps.content
        .classify({ target: reading.target, name, tools: [tool], release })
        .catch(() => null);
      const [subtree] = deployTargetSubtrees(name, [tool]);
      if (state === "diverged" && subtree !== undefined) {
        folders[tool] = join(reading.tree, subtree);
      }
    }
    return folders;
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
  if ("folder" in judged) {
    return { name, refusal: null };
  }
  return judged.folders === undefined
    ? { name, refusal: judged.refusal }
    : { name, refusal: judged.refusal, folders: judged.folders };
}
