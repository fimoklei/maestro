// Reads a target's apm.lock.yaml plus what is actually on disk under it. Four
// outcomes the cockpit must never blur: missing is "nothing deployed", an entry
// that is not a manageable skill is skipped with its reading, a recorded file
// that is gone is not a deployed skill, and malformed is a visible error (#58,
// #358, #941).
import { join } from "node:path";
import type { DeployedContentPort, DeployTarget } from "../deploy/deploy-skill";
import type { SupportedTool } from "../deploy/deploy-tools";
import type { GitOrigin } from "../deploy/git-origin";
import type { PendingOperation } from "../deploy/retry-target-operation";
import { resolveHomeDirectory } from "../home-directory";
import {
  type LockfileEntry,
  parseLockfile,
  readPackage,
  type UnreadableEntry,
} from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import {
  type DeployedPrimitive,
  type PinnedPerSkill,
  type ReleaseHead,
  type SkippedEntry,
  skippedFromReading,
} from "./deploy-state-types";
import {
  groupPrimitivesByTool,
  type ToolDeployState,
} from "./group-primitives-by-tool";
import { harnessSkillPin, type SkillPin, tallyPins } from "./pinned-per-skill";
import type { ReleaseHeadReader } from "./release-head";
import {
  countExtraRootPackageFiles,
  DEPLOY_SKILL_PREFIXES,
  deployedRootPackageSkills,
} from "./root-package-skills";

type DeployStateResult =
  | {
      ok: true;
      primitives: DeployedPrimitive[];
      skipped: SkippedEntry[];
      // Absent for a target that follows no single release, and for one read
      // without a Release-head reader wired in.
      releaseHead?: ReleaseHead;
      // Absent unless the target still holds per-skill dependencies on the
      // connected Harness (#950).
      pinnedPerSkill?: PinnedPerSkill;
      // Absent where the record holds no file outside the selected skills.
      extraFiles?: number;
      // Absent unless a Deploy or Remove on this target never finished (#951).
      pendingOperation?: PendingOperation;
    }
  | { ok: false; error: "malformed" };

// Grouped per detected tool, which also carries the detected set (ADR-0011).
// `otherOrigins`: a skill entry no detected tool's prefix claims, named by its
// repo rather than silently dropped (#655).
type GlobalDeployStateResult =
  | {
      ok: true;
      tools: ToolDeployState[];
      skipped: SkippedEntry[];
      otherOrigins: string[];
      // One record for the whole global target, whatever the tool count (#951).
      pendingOperation?: PendingOperation;
    }
  | { ok: false; error: "malformed" };

// The optional readings a target card leads with. Omitting any of them leaves
// an honest unknown — a missing Release head, a row with no copy chip, no
// status on a pin — never a claim the reader did not measure (J04).
export type DeployStateExtras = {
  releaseHead?: Pick<ReleaseHeadReader, "read">;
  content?: Pick<DeployedContentPort, "classify">;
  // Which Harness the cockpit is connected to. Without it a per-skill pin gets
  // no reading at all: attributing one to this Harness would be a guess (#950).
  harnessOrigin?: () => Promise<GitOrigin | null>;
  // What a Deploy or Remove on this target set out to do and never finished,
  // so the card can offer the retry (#951).
  operations?: {
    pending(target: DeployTarget): Promise<PendingOperation | null>;
  };
};

export class DeployStateReader {
  protected readonly fs: FileSystemPort;
  protected readonly extras: DeployStateExtras;

  constructor(deps: { fs: FileSystemPort } & DeployStateExtras) {
    this.fs = deps.fs;
    this.extras = {
      releaseHead: deps.releaseHead,
      content: deps.content,
      harnessOrigin: deps.harnessOrigin,
      operations: deps.operations,
    };
  }

  // Null on every failure: an origin that could not be read is unknown, which
  // reads the same as no Harness connected (J04).
  protected async connectedOrigin(): Promise<GitOrigin | null> {
    return (await this.extras.harnessOrigin?.().catch(() => null)) ?? null;
  }

  async read(repoPath: string): Promise<DeployStateResult> {
    const raw = await this.fs.readFile(join(repoPath, "apm.lock.yaml"));
    if (raw === null) {
      // Still read the record: a first Deploy that stopped leaves no lockfile,
      // and its Retry deploy has to survive that (#951).
      const unfinished = await this.readPending({ kind: "repo", repoPath });
      return {
        ok: true,
        primitives: [],
        skipped: [],
        ...(unfinished === undefined ? {} : { pendingOperation: unfinished }),
      };
    }

    const parsed = parseLockfile(raw);
    if (!parsed.ok) {
      return { ok: false, error: "malformed" };
    }

    const primitives: DeployedPrimitive[] = [];
    const skipped: SkippedEntry[] = unreadableAsSkipped(parsed.unreadable);
    const origin = await this.connectedOrigin();
    const pins: SkillPin[] = [];
    let root: LockfileEntry | undefined;
    // The Selection: the root package's own skills. A leftover per-skill row
    // from before migration is deployed but selected by nothing (story 4).
    const selection: string[] = [];
    for (const entry of parsed.entries) {
      const reading = readPackage(entry);
      if (reading.kind === "package") {
        // More than one root package is a shape this read cannot attribute;
        // the first is the Harness dependency in every shape apm writes today.
        root ??= entry;
        continue;
      }
      if (reading.kind !== "skill") {
        // Parsing rejects a non-root row that names no path, so this one has it.
        skipped.push(skippedFromReading(reading, entry.virtual_path ?? ""));
        continue;
      }
      const pin = harnessSkillPin(entry, origin);
      if (pin !== null) {
        pins.push(pin);
      }
      primitives.push({
        type: "skill",
        name: reading.name,
        version: entry.resolved_ref,
      });
    }

    if (root !== undefined) {
      const deployed = await deployedRootPackageSkills(
        root,
        DEPLOY_SKILL_PREFIXES,
        (file) => this.fs.isFileEntry(join(repoPath, file)),
      );
      // One row per skill, whatever the number of tool subtrees holding it.
      for (const name of new Set(deployed.map((skill) => skill.name))) {
        selection.push(name);
        primitives.push({ type: "skill", name, version: root.resolved_ref });
      }
    }

    const target: DeployTarget = { kind: "repo", repoPath };
    await this.markCopies(primitives, target);
    const pinnedPerSkill = tallyPins(pins);
    // The two statuses are exclusive: a target still holding per-skill pins
    // reads as Pinned per skill and follows no single release, so no Update
    // target is offered where there is no mechanism for one (stories 59, 60).
    const releaseHead =
      root === undefined || pinnedPerSkill !== undefined
        ? undefined
        : await this.readHead(repoPath, root.resolved_ref, selection);
    const extraFiles =
      root === undefined
        ? 0
        : countExtraRootPackageFiles(root, DEPLOY_SKILL_PREFIXES);
    const pendingOperation = await this.readPending(target);
    // Spread, never a null key: a reading this target has not got must not
    // survive JSON as one the cockpit reads as measured (#416).
    return {
      ok: true,
      primitives,
      skipped,
      ...(releaseHead === undefined ? {} : { releaseHead }),
      ...(pinnedPerSkill === undefined ? {} : { pinnedPerSkill }),
      ...(extraFiles === 0 ? {} : { extraFiles }),
      ...(pendingOperation === undefined ? {} : { pendingOperation }),
    };
  }

  // Undefined on every failure: a record the reader could not reach is not an
  // operation it can claim never finished (J04).
  protected async readPending(
    target: DeployTarget,
  ): Promise<PendingOperation | undefined> {
    return (
      (await this.extras.operations?.pending(target).catch(() => null)) ??
      undefined
    );
  }

  // The chip a row carries when its copy disagrees with the recorded baseline,
  // or has none to check it against. An unreadable copy carries no chip: the
  // write path is where that refusal belongs, not the reading.
  protected async markCopies(
    primitives: DeployedPrimitive[],
    target: DeployTarget,
    tools?: readonly SupportedTool[],
  ): Promise<void> {
    // Called on the port, never detached: the adapter's classify reads its own
    // injected location off `this`.
    const content = this.extras.content;
    if (content === undefined) {
      return;
    }
    await Promise.all(
      primitives.map(async (primitive) => {
        const state = await content
          .classify({
            target,
            name: primitive.name,
            tools,
          })
          .catch(() => null);
        if (state === "diverged") {
          primitive.copy = "local-edits";
        } else if (state === "unverifiable") {
          primitive.copy = "unverified";
        }
      }),
    );
  }

  protected async readHead(
    key: string,
    release: string,
    selection: readonly string[],
  ): Promise<ReleaseHead | undefined> {
    return await this.extras.releaseHead?.read({ key, release, selection });
  }
}

function unreadableAsSkipped(
  unreadable: readonly UnreadableEntry[],
): SkippedEntry[] {
  return unreadable.map((entry) => ({
    reason: "unreadable",
    virtualPath: entry.virtualPath,
  }));
}

// A separate type so the tool-presence dependency is required by the
// constructor: omitting it fails to compile rather than 500 at runtime (#187).
export class GlobalDeployStateReader extends DeployStateReader {
  private readonly toolPresence: ToolPresencePort;
  private readonly treeRoot: () => string;

  constructor(
    deps: {
      fs: FileSystemPort;
      toolPresence: ToolPresencePort;
      // What deployed_files are relative to. A global install splits lockfile
      // from tree: apm writes the lockfile under ~/.apm and the files under
      // HOME (apm-behavior.md § Global scope).
      treeRoot?: () => string;
    } & DeployStateExtras,
  ) {
    super(deps);
    this.toolPresence = deps.toolPresence;
    this.treeRoot = deps.treeRoot ?? (() => resolveHomeDirectory(process.env));
  }

  // `rootPath` is server-resolved; no client path reaches here. Detection is
  // live per read, so a tool installed since startup needs no restart.
  async readGlobal(rootPath: string): Promise<GlobalDeployStateResult> {
    const detected = await this.toolPresence.detectGlobalTools();
    const raw = await this.fs.readFile(join(rootPath, "apm.lock.yaml"));
    if (raw === null) {
      // Nothing deployed yet: an empty group per detected tool, never an error
      // and never a tool the machine does not have. The record is still read: a
      // first Deploy that stopped leaves no lockfile (#951).
      const unfinished = await this.readPending({ kind: "global" });
      return {
        ok: true,
        tools: detected.map((tool) => ({ tool, primitives: [] })),
        skipped: [],
        otherOrigins: [],
        ...(unfinished === undefined ? {} : { pendingOperation: unfinished }),
      };
    }

    const parsed = parseLockfile(raw);
    if (!parsed.ok) {
      return { ok: false, error: "malformed" };
    }
    const tree = this.treeRoot();
    const grouped = await groupPrimitivesByTool(parsed.entries, detected, {
      fileExists: (file) => this.fs.isFileEntry(join(tree, file)),
      origin: await this.connectedOrigin(),
    });
    for (const group of grouped.tools) {
      await this.markCopies(group.primitives, { kind: "global" }, [group.tool]);
      // Exclusive with Pinned per skill, as on the repo card (stories 59, 60).
      if (grouped.release !== undefined && group.pinnedPerSkill === undefined) {
        group.releaseHead = await this.readHead(
          `global:${group.tool}`,
          grouped.release,
          group.primitives.map((primitive) => primitive.name),
        );
      }
    }
    const pendingOperation = await this.readPending({ kind: "global" });
    return {
      ok: true,
      tools: grouped.tools,
      skipped: [...unreadableAsSkipped(parsed.unreadable), ...grouped.skipped],
      otherOrigins: grouped.otherOrigins,
      ...(pendingOperation === undefined ? {} : { pendingOperation }),
    };
  }
}
