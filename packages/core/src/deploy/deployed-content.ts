import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { isRootPackage } from "../deploy-state/root-package-skills";
import type { CopyTreeFsPort, OpenFile } from "../filesystem/copy-tree-fs";
import { parseLockfile, unreadableCovers } from "../lockfile/lockfile";
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

export class DeployedContentAdapter implements DeployedContentPort {
  private readonly deps: {
    location: Pick<DeployedLocation, "treeRoot" | "lockfilePath">;
    // Absent, a copy is only measured against its recorded baseline.
    inventoryGit?: Pick<InventoryGitPort, "readSkillFilesAtTag">;
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
  }): Promise<DeployedContentState> {
    const subtrees = deployTargetSubtrees(input.name, input.tools);
    // Baseline first: with no recorded hashes the scan skips hashing (#63).
    const baseline = await this.readBaseline(
      input.target,
      input.name,
      subtrees,
    );
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

  private async readBaseline(
    target: DeployTarget,
    name: string,
    subtrees: string[],
  ): Promise<
    | { kind: "none" }
    | { kind: "malformed" }
    | { kind: "hashes"; hashes: DeployedFileHashes }
  > {
    const lockfilePath = this.deps.location.lockfilePath(target);
    const file = await this.openFollowingLinks(lockfilePath);
    // Present but unreadable is an error, not an absent baseline (#58).
    if (file === "missing") {
      return { kind: "none" };
    }
    if (file === null) {
      return { kind: "malformed" };
    }
    let raw: string;
    try {
      raw = (await file.read()).toString("utf8");
    } catch {
      return { kind: "malformed" };
    } finally {
      await file.close();
    }

    const parsed = parseLockfile(raw);
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

  // Reads through a symlinked file, which the port never follows. "missing"
  // when nothing is there, a dangling link included; null when unreadable.
  private async openFollowingLinks(
    path: string,
  ): Promise<OpenFile | "missing" | null> {
    const { fs } = this.deps;
    const file = await fs.openFile(path);
    if (file !== null) {
      return file;
    }
    const facts = await fs.describe(path);
    if (facts === null) {
      return "missing";
    }
    if (facts.kind !== "symlink") {
      return null;
    }
    const target = await fs.realpath(path);
    return target === null ? "missing" : fs.openFile(target);
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
        const file = await this.openFollowingLinks(childAbs);
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
