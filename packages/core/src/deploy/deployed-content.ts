import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";
import { isRootPackage } from "../deploy-state/root-package-skills";
import type { CopyTreeFsPort } from "../filesystem/copy-tree-fs";
import { harnessSkillSubpath } from "../inventory/harness-layout";
import {
  type LockfileReading,
  parseLockfile,
  unreadableCovers,
} from "../lockfile/lockfile";
import {
  type CopyReading,
  type CopyReadingPort,
  releasesAround,
  type WrittenReading,
} from "./copy-reading";
import type { LinkedDestination } from "./deploy-ports";
import type {
  DeployedContentPort,
  DeployedContentState,
  DeployTarget,
  InventoryGitPort,
} from "./deploy-skill";
import {
  deployTargetSubtrees,
  deployToolFolders,
  type SupportedTool,
} from "./deploy-tools";
import {
  classifyDeployedDrift,
  type DeployedFileHashes,
} from "./deployed-content-drift";
import type { DeployedLocation } from "./deployed-location";

class DeployedSubtreeUnreadableError extends Error {}

type SubtreeScan = { hashes: DeployedFileHashes; fileCount: number };

export class DeployedContentAdapter
  implements DeployedContentPort, CopyReadingPort
{
  private readonly deps: {
    location: Pick<DeployedLocation, "treeRoot" | "lockfilePath" | "toolRoots">;
    inventoryGit?: Pick<InventoryGitPort, "readSkillFilesAtTag">;
    workingHarness?: () => Promise<string | undefined>;
    fs: CopyTreeFsPort;
  };

  constructor(deps: DeployedContentAdapter["deps"]) {
    this.deps = deps;
  }

  async classify(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
    release?: string;
    lockfile: LockfileReading;
  }): Promise<DeployedContentState> {
    const subtrees = this.subtrees(input.target, input.name, input.tools);
    const baseline = this.baseline(input.lockfile, input.name, subtrees);
    const root = this.deps.location.treeRoot(input.target);
    let scan: SubtreeScan;
    try {
      scan = await this.scanSubtrees(root, subtrees, {
        hash: baseline.kind === "hashes",
      });
    } catch (error) {
      if (error instanceof DeployedSubtreeUnreadableError) {
        return "unreadable";
      }
      throw error;
    }

    if (baseline.kind === "malformed") {
      return "lockfile-malformed";
    }
    if (scan.fileCount === 0) {
      return "not-deployed";
    }
    if (baseline.kind !== "hashes") {
      return "unverifiable";
    }
    if (classifyDeployedDrift(baseline.hashes, scan.hashes) === "clean") {
      return "clean";
    }
    return (await this.equalsRelease(
      input.release,
      input.name,
      subtrees,
      scan,
      baseline.hashes,
    ))
      ? "clean"
      : "diverged";
  }

  openReading(input: Parameters<CopyReadingPort["openReading"]>[0]) {
    const trees = new Map<string, Promise<DeployedFileHashes | null>>();
    const releasedTree = (tag: string, name: string) => {
      const key = `${tag}\0${name}`;
      let tree = trees.get(key);
      if (tree === undefined) {
        tree =
          this.deps.inventoryGit
            ?.readSkillFilesAtTag(tag, name)
            .catch(() => null) ?? Promise.resolve(null);
        trees.set(key, tree);
      }
      return tree;
    };
    const holds = async (
      tag: string | undefined,
      name: string,
      copy: DeployedFileHashes,
    ) => {
      if (tag === undefined) return false;
      const tree = await releasedTree(tag, name);
      return tree !== null && classifyDeployedDrift(tree, copy) === "clean";
    };
    const working = new Map<string, Promise<DeployedFileHashes | null>>();
    const workingTree = (name: string) => {
      let tree = working.get(name);
      if (tree === undefined) {
        tree = this.readWorkingSkill(name);
        working.set(name, tree);
      }
      return tree;
    };
    const { older, latest } = releasesAround(input.release, input.tags);
    const root = this.deps.location.treeRoot(input.target);
    const scanCopy = async (name: string, tool: SupportedTool) => {
      const subtree = this.subtrees(input.target, name, [tool])[0] ?? "";
      try {
        const scan = await this.scanSubtrees(root, [subtree], { hash: true });
        return {
          subtree,
          fileCount: scan.fileCount,
          copy: stripSubtree(scan.hashes, subtree),
        };
      } catch (error) {
        if (error instanceof DeployedSubtreeUnreadableError) return null;
        throw error;
      }
    };
    const olderReleaseHolding = async (
      name: string,
      copy: DeployedFileHashes,
    ) => {
      for (const tag of older) {
        if (await holds(tag, name, copy)) return tag;
      }
      return null;
    };
    return {
      readWritten: async (
        name: string,
        tool: SupportedTool,
      ): Promise<WrittenReading> => {
        const scanned = await scanCopy(name, tool);
        if (scanned === null) return { kind: "unreadable" };
        if (scanned.fileCount === 0) return { kind: "missing" };
        if (
          input.release === undefined ||
          (await releasedTree(input.release, name)) === null
        ) {
          return { kind: "unreadable" };
        }
        if (await holds(input.release, name, scanned.copy)) {
          return { kind: "at-release" };
        }
        return {
          kind: "not-updated",
          stillAt: await olderReleaseHolding(name, scanned.copy),
          targetRelease: input.release,
        };
      },
      read: async (name: string, tool: SupportedTool): Promise<CopyReading> => {
        const scanned = await scanCopy(name, tool);
        if (scanned === null) return { kind: "unreadable" };
        const { subtree, copy } = scanned;
        const baseline = this.baseline(input.lockfile, name, [subtree]);
        if (baseline.kind === "malformed") return { kind: "unreadable" };
        if (scanned.fileCount === 0) return { kind: "missing" };
        if (await holds(input.release, name, copy)) {
          return { kind: "at-release" };
        }
        if (baseline.kind !== "hashes") return { kind: "unverified" };
        const recorded = stripSubtree(baseline.hashes, subtree);
        if (classifyDeployedDrift(recorded, copy) !== "clean") {
          if (await holds(latest, name, copy)) return { kind: "at-release" };
          const harness = await workingTree(name);
          return harness !== null &&
            classifyDeployedDrift(harness, copy) === "clean"
            ? { kind: "edits-in-harness" }
            : { kind: "local-edits" };
        }
        if (
          input.release === undefined ||
          (await releasedTree(input.release, name)) === null
        ) {
          return { kind: "at-release" };
        }
        return {
          kind: "not-updated",
          stillAt: await olderReleaseHolding(name, copy),
          targetRelease: input.release,
        };
      },
    };
  }

  async harnessHolds(
    input: Parameters<CopyReadingPort["harnessHolds"]>[0],
  ): Promise<boolean> {
    const subtrees = this.subtrees(input.target, input.name);
    const baseline = this.baseline(input.lockfile, input.name, subtrees);
    if (baseline.kind !== "hashes") return false;
    const harness = await this.readWorkingSkill(input.name);
    if (harness === null) return false;
    const root = this.deps.location.treeRoot(input.target);
    const scan = await this.scanSubtrees(root, subtrees, { hash: true }).catch(
      () => null,
    );
    if (scan === null) return false;
    let held = false;
    for (const subtree of subtrees) {
      const deployed = stripSubtree(scan.hashes, subtree);
      if (
        Object.keys(deployed).length === 0 ||
        classifyDeployedDrift(
          stripSubtree(baseline.hashes, subtree),
          deployed,
        ) === "clean"
      ) {
        continue;
      }
      if (classifyDeployedDrift(harness, deployed) !== "clean") return false;
      held = true;
    }
    return held;
  }

  private async readWorkingSkill(
    name: string,
  ): Promise<DeployedFileHashes | null> {
    const root = await this.deps.workingHarness?.().catch(() => undefined);
    if (root === undefined) return null;
    const subtree = harnessSkillSubpath(name);
    const scan = await this.scanSubtrees(root, [subtree], {
      hash: true,
    }).catch(() => null);
    return scan === null || scan.fileCount === 0
      ? null
      : stripSubtree(scan.hashes, subtree);
  }

  async contentDigest(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }): Promise<string | null> {
    const root = this.deps.location.treeRoot(input.target);
    const subtrees = this.subtrees(input.target, input.name, input.tools);
    const scan = await this.scanSubtrees(root, subtrees, { hash: true }).catch(
      () => null,
    );
    return scan === null
      ? null
      : Object.entries(scan.hashes)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([path, hash]) => `${path}=${hash}`)
          .join("\n");
  }

  private async equalsRelease(
    release: string | undefined,
    name: string,
    subtrees: string[],
    scan: SubtreeScan,
    recorded: DeployedFileHashes,
  ): Promise<boolean> {
    if (release === undefined || this.deps.inventoryGit === undefined) {
      return false;
    }
    const released = await this.deps.inventoryGit
      .readSkillFilesAtTag(release, name)
      .catch(() => null);
    if (released === null) {
      return false;
    }
    for (const subtree of subtrees) {
      const deployed = stripSubtree(scan.hashes, subtree);
      if (Object.keys(deployed).length === 0) {
        continue;
      }
      if (
        classifyDeployedDrift(stripSubtree(recorded, subtree), deployed) ===
        "clean"
      ) {
        continue;
      }
      if (classifyDeployedDrift(released, deployed) !== "clean") {
        return false;
      }
    }
    return true;
  }

  async linkedDestination(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }): Promise<LinkedDestination | null> {
    const root = this.deps.location.treeRoot(input.target);
    const roots = this.deps.location.toolRoots(input.target);
    const candidates = [
      ...deployToolFolders(roots, input.tools).map((folder) => ({
        kind: "tool-folder" as const,
        path: resolve(root, folder),
      })),
      ...this.subtrees(input.target, input.name, input.tools).map(
        (subtree) => ({
          kind: "skill-folder" as const,
          path: resolve(root, subtree),
        }),
      ),
    ];
    for (const candidate of candidates) {
      if ((await this.deps.fs.describe(candidate.path))?.kind === "symlink") {
        return candidate;
      }
    }
    return null;
  }

  private subtrees(
    target: DeployTarget,
    name: string,
    tools?: readonly SupportedTool[],
  ): string[] {
    return deployTargetSubtrees(
      name,
      this.deps.location.toolRoots(target),
      tools,
    );
  }

  async readLockfile(target: DeployTarget): Promise<LockfileReading> {
    const lockfilePath = this.deps.location.lockfilePath(target);
    const file = await this.deps.fs.openFollowingLinks(lockfilePath);
    if (file === "missing") {
      return "missing";
    }
    if (file === null) {
      return { ok: false };
    }
    try {
      return parseLockfile((await file.read()).toString("utf8"));
    } catch {
      return { ok: false };
    } finally {
      await file.close().catch(() => undefined);
    }
  }

  private baseline(
    parsed: LockfileReading,
    name: string,
    subtrees: string[],
  ):
    | { kind: "none" }
    | { kind: "malformed" }
    | { kind: "hashes"; hashes: DeployedFileHashes } {
    if (parsed === "missing") {
      return { kind: "none" };
    }
    if (!parsed.ok) {
      return { kind: "malformed" };
    }

    if (unreadableCovers(parsed.unreadable, name)) {
      return { kind: "malformed" };
    }

    const entry =
      parsed.entries.find(
        (e) =>
          e.virtual_path !== undefined && basename(e.virtual_path) === name,
      ) ?? parsed.entries.find(isRootPackage);
    if (entry === undefined) {
      return { kind: "none" };
    }
    const recorded = entry.deployed_file_hashes;
    if (recorded === undefined || Object.keys(recorded).length === 0) {
      return { kind: "none" };
    }
    const hashes = scopeHashesToSubtrees(recorded, subtrees);
    if (Object.keys(hashes).length === 0) {
      return { kind: "none" };
    }
    return { kind: "hashes", hashes };
  }

  private async scanSubtrees(
    root: string,
    subtrees: string[],
    opts: { hash: boolean },
  ): Promise<SubtreeScan> {
    const { fs } = this.deps;
    const hashes: DeployedFileHashes = {};
    let fileCount = 0;
    const walk = async (rel: string): Promise<void> => {
      const abs = resolve(root, rel);
      const names = await fs.listNames(abs);
      if (names === null) {
        if ((await fs.describe(abs)) === null) {
          return;
        }
        throw new DeployedSubtreeUnreadableError();
      }
      for (const name of names) {
        const childRel = `${rel}/${name}`;
        const childAbs = resolve(root, childRel);
        if ((await fs.describe(childAbs))?.kind === "directory") {
          await walk(childRel);
          continue;
        }
        fileCount++;
        const file = await fs.openFollowingLinks(childAbs);
        if (file === "missing" || file === null) {
          throw new DeployedSubtreeUnreadableError();
        }
        try {
          if (opts.hash) {
            const bytes = await file.read();
            hashes[childRel] =
              `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
          }
        } catch {
          throw new DeployedSubtreeUnreadableError();
        } finally {
          await file.close();
        }
      }
    };
    for (const subtree of subtrees) {
      await walk(subtree);
    }
    return { hashes, fileCount };
  }
}

function stripSubtree(
  hashes: DeployedFileHashes,
  subtree: string,
): DeployedFileHashes {
  const stripped: DeployedFileHashes = {};
  for (const [path, hash] of Object.entries(hashes)) {
    if (path.startsWith(`${subtree}/`)) {
      stripped[path.slice(subtree.length + 1)] = hash;
    }
  }
  return stripped;
}

function scopeHashesToSubtrees(
  hashes: DeployedFileHashes,
  subtrees: string[],
): DeployedFileHashes {
  const scoped: DeployedFileHashes = {};
  for (const [path, hash] of Object.entries(hashes)) {
    if (subtrees.some((subtree) => path.startsWith(`${subtree}/`))) {
      scoped[path] = hash;
    }
  }
  return scoped;
}
