// Reads a target's apm.lock.yaml plus what is on disk under it, keeping absent,
// skipped, phantom and malformed apart.
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
      releaseHead?: ReleaseHead;
      pinnedPerSkill?: PinnedPerSkill;
      extraFiles?: number;
      pendingOperation?: PendingOperation;
    }
  | { ok: false; error: "malformed" };

// `otherOrigins`: skill entries no detected tool's prefix claims, named by
// their repo rather than silently dropped.
type GlobalDeployStateResult =
  | {
      ok: true;
      tools: ToolDeployState[];
      skipped: SkippedEntry[];
      otherOrigins: string[];
      pendingOperation?: PendingOperation;
    }
  | { ok: false; error: "malformed" };

// Omitting any of these leaves an unknown reading, never an unmeasured claim.
export type DeployStateExtras = {
  releaseHead?: Pick<ReleaseHeadReader, "read">;
  content?: Pick<DeployedContentPort, "classify">;
  // Without it a per-skill pin gets no reading: attributing one would be a guess.
  harnessOrigin?: () => Promise<GitOrigin | null>;
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

  // Null on every failure: an unreadable origin reads as no Harness connected.
  protected async connectedOrigin(): Promise<GitOrigin | null> {
    return (await this.extras.harnessOrigin?.().catch(() => null)) ?? null;
  }

  async read(repoPath: string): Promise<DeployStateResult> {
    const raw = await this.fs.readFile(join(repoPath, "apm.lock.yaml"));
    if (raw === null) {
      // A first Deploy that stopped leaves no lockfile; its retry must survive.
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
    // The root package's own skills; a leftover per-skill row is not selected.
    const selection: string[] = [];
    for (const entry of parsed.entries) {
      const reading = readPackage(entry);
      if (reading.kind === "package") {
        root ??= entry;
        continue;
      }
      if (reading.kind !== "skill") {
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
      for (const name of new Set(deployed.map((skill) => skill.name))) {
        selection.push(name);
        primitives.push({ type: "skill", name, version: root.resolved_ref });
      }
    }

    const target: DeployTarget = { kind: "repo", repoPath };
    await this.markCopies(primitives, target);
    const pinnedPerSkill = tallyPins(pins);
    // Exclusive with Pinned per skill: such a target follows no single release.
    const releaseHead =
      root === undefined || pinnedPerSkill !== undefined
        ? undefined
        : await this.readHead(repoPath, root.resolved_ref, selection);
    const extraFiles =
      root === undefined
        ? 0
        : countExtraRootPackageFiles(root, DEPLOY_SKILL_PREFIXES);
    const pendingOperation = await this.readPending(target);
    // Spread, never a null key: a missing reading must not reach JSON (#416).
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

  protected async readPending(
    target: DeployTarget,
  ): Promise<PendingOperation | undefined> {
    return (
      (await this.extras.operations?.pending(target).catch(() => null)) ??
      undefined
    );
  }

  // An unreadable copy carries no chip: the write path refuses it instead.
  protected async markCopies(
    primitives: DeployedPrimitive[],
    target: DeployTarget,
    tools?: readonly SupportedTool[],
  ): Promise<void> {
    // Call classify on the port, never detached: it reads `this`.
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

// A separate class so a missing tool-presence dependency fails to compile (#187).
export class GlobalDeployStateReader extends DeployStateReader {
  private readonly toolPresence: ToolPresencePort;
  private readonly treeRoot: () => string;

  constructor(
    deps: {
      fs: FileSystemPort;
      toolPresence: ToolPresencePort;
      // What deployed_files are relative to: a global install writes the
      // lockfile under ~/.apm and the files under HOME.
      treeRoot?: () => string;
    } & DeployStateExtras,
  ) {
    super(deps);
    this.toolPresence = deps.toolPresence;
    this.treeRoot = deps.treeRoot ?? (() => resolveHomeDirectory(process.env));
  }

  // `rootPath` is server-resolved; no client path reaches here.
  async readGlobal(rootPath: string): Promise<GlobalDeployStateResult> {
    const detected = await this.toolPresence.detectGlobalTools();
    const raw = await this.fs.readFile(join(rootPath, "apm.lock.yaml"));
    if (raw === null) {
      // A first Deploy that stopped leaves no lockfile; its retry must survive.
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
      // Exclusive with Pinned per skill, as on the repo card.
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
