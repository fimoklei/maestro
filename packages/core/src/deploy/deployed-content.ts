import { createHash } from "node:crypto";
import { basename, join } from "node:path";
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
import type {
  DeployedContentPort,
  DeployedContentState,
  DeployTarget,
  InventoryGitPort,
} from "./deploy-skill";
import { deployTargetSubtrees, type SupportedTool } from "./deploy-tools";
import {
  classifyDeployedDrift,
  type DeployedFileHashes,
} from "./deployed-content-drift";
import type { DeployedLocation } from "./deployed-location";

// Keeps an existing-but-unreadable subtree from swallowing to empty, which
// would read as "nothing deployed" and let a deploy overwrite blindly (#59).
class DeployedSubtreeUnreadableError extends Error {}

// `hashes` is empty unless hashing was requested; `fileCount` is always set.
type SubtreeScan = { hashes: DeployedFileHashes; fileCount: number };

export class DeployedContentAdapter
  implements DeployedContentPort, CopyReadingPort
{
  private readonly deps: {
    location: Pick<DeployedLocation, "treeRoot" | "lockfilePath">;
    // Absent, a copy is only measured against its recorded baseline.
    inventoryGit?: Pick<InventoryGitPort, "readSkillFilesAtTag">;
    // The Working harness's folder; absent or unresolved, no Local edits copy
    // reads Edits in the Harness.
    workingHarness?: () => Promise<string | undefined>;
    // Walks, reads and hashes the copy; an in-memory tree in tests.
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
    const subtrees = deployTargetSubtrees(input.name, input.tools);
    // Baseline first: with no recorded hashes the scan skips hashing (#63).
    const baseline = this.baseline(input.lockfile, input.name, subtrees);
    const root = this.deps.location.treeRoot(input.target);
    let scan: SubtreeScan;
    try {
      scan = await this.scanSubtrees(root, subtrees, {
        hash: baseline.kind === "hashes",
      });
    } catch (error) {
      // Checked before the baseline branches, so an unreadable destination
      // outranks a malformed lockfile (#59).
      if (error instanceof DeployedSubtreeUnreadableError) {
        return "unreadable";
      }
      throw error;
    }

    if (baseline.kind === "malformed") {
      return "lockfile-malformed";
    }
    // A fully-deleted copy is restored, never refused as "local edits" (#65).
    if (scan.fileCount === 0) {
      return "not-deployed";
    }
    if (baseline.kind !== "hashes") {
      return "unverifiable";
    }
    if (classifyDeployedDrift(baseline.hashes, scan.hashes) === "clean") {
      return "clean";
    }
    // Second chance: a copy equal to the release about to be installed is not
    // the reader's edit (#952).
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
    // Null where the copy cannot be read.
    const scanCopy = async (name: string, tool: SupportedTool) => {
      const subtree = deployTargetSubtrees(name, [tool])[0] ?? "";
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
        // Equal to its record, but the Target release could not be read:
        // the record is the only proof, as before.
        if (
          input.release === undefined ||
          (await releasedTree(input.release, name)) === null
        ) {
          return { kind: "at-release" };
        }
        return {
          kind: "not-updated",
          stillAt: await olderReleaseHolding(name, copy),
        };
      },
    };
  }

  async harnessHolds(
    input: Parameters<CopyReadingPort["harnessHolds"]>[0],
  ): Promise<boolean> {
    const subtrees = deployTargetSubtrees(input.name);
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

  // Null where no Harness is connected or its skill folder is empty or unreadable.
  private async readWorkingSkill(
    name: string,
  ): Promise<DeployedFileHashes | null> {
    const root = await this.deps.workingHarness?.().catch(() => undefined);
    if (root === undefined) return null;
    const subtree = harnessSkillSubpath(name);
    // Any failure leaves the copy Local edits, never unread.
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
    const subtrees = deployTargetSubtrees(input.name, input.tools);
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

  // Whole-tree equality per subtree; a subtree still equal to its record holds
  // no work either (#1213). An unreadable release answers false.
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
      // A subtree the write never landed in is not a missing copy.
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

  // apm refuses when the leaf skill dir is a symlink. Never follows a link: a
  // link resolves to a dir (#748).
  async linkedSkillPath(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }): Promise<string | null> {
    const root = this.deps.location.treeRoot(input.target);
    for (const subtree of deployTargetSubtrees(input.name, input.tools)) {
      const abs = join(root, subtree);
      const facts = await this.deps.fs.describe(abs);
      if (facts?.kind === "symlink") {
        return abs;
      }
    }
    return null;
  }

  async readLockfile(target: DeployTarget): Promise<LockfileReading> {
    const lockfilePath = this.deps.location.lockfilePath(target);
    const file = await this.deps.fs.openFollowingLinks(lockfilePath);
    // Present but unreadable is an error, not an absent baseline (#58).
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

    // By name, never by package_type (#358). A root package's one row holds
    // every skill's hashes, scoped to the subtrees below.
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
    // Drops untargeted tools, so their absence on disk is not drift (#136).
    const hashes = scopeHashesToSubtrees(recorded, subtrees);
    if (Object.keys(hashes).length === 0) {
      return { kind: "none" };
    }
    return { kind: "hashes", hashes };
  }

  // Keys use forward slashes, matching the lockfile's own keys.
  private async scanSubtrees(
    root: string,
    subtrees: string[],
    opts: { hash: boolean },
  ): Promise<SubtreeScan> {
    const { fs } = this.deps;
    const hashes: DeployedFileHashes = {};
    let fileCount = 0;
    const walk = async (rel: string): Promise<void> => {
      const abs = join(root, rel);
      const names = await fs.listNames(abs);
      if (names === null) {
        // Missing reads as empty; present but unlistable is unreadable (#59).
        if ((await fs.describe(abs)) === null) {
          return;
        }
        throw new DeployedSubtreeUnreadableError();
      }
      for (const name of names) {
        const childRel = `${rel}/${name}`;
        const childAbs = join(root, childRel);
        // describe never follows a link, so a linked dir counts as one file.
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
            // Raw bytes, never utf8: decoding would flag a binary asset as drift.
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

// Re-keys hashes relative to the skill directory, as the release names them.
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

// The trailing "/" matters: without it "skills/tddx" matches "skills/tdd".
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
