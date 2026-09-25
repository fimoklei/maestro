// Touches node:fs directly: no port models walking and hashing a tree (#56).

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { isRootPackage } from "../deploy-state/root-package-skills";
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

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

// `hashes` is empty unless hashing was requested; `fileCount` is always set.
type SubtreeScan = { hashes: DeployedFileHashes; fileCount: number };

export class DeployedContentAdapter implements DeployedContentPort {
  private readonly deps: {
    location: Pick<DeployedLocation, "treeRoot" | "lockfilePath">;
    // Absent, a copy is only measured against its recorded baseline.
    inventoryGit?: Pick<InventoryGitPort, "readSkillFilesAtTag">;
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
    return (await this.equalsRelease(input.release, input.name, subtrees, scan))
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

  // Whole-tree equality per subtree. An unreadable release answers false.
  private async equalsRelease(
    release: string | undefined,
    name: string,
    subtrees: string[],
    scan: SubtreeScan,
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
      if (classifyDeployedDrift(released, deployed) !== "clean") {
        return false;
      }
    }
    return true;
  }

  // apm refuses when the leaf skill dir is a symlink. lstat, not stat: a link
  // resolves to a dir (#748).
  async linkedSkillPath(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }): Promise<string | null> {
    const root = this.deps.location.treeRoot(input.target);
    for (const subtree of deployTargetSubtrees(input.name, input.tools)) {
      const abs = join(root, subtree);
      const stats = await lstat(abs).catch(() => null);
      if (stats?.isSymbolicLink()) {
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
    let raw: string;
    try {
      raw = await readFile(this.deps.location.lockfilePath(target), "utf8");
    } catch (error) {
      // Present but unreadable is an error, not an absent baseline (#58).
      if (isMissing(error)) {
        return { kind: "none" };
      }
      return { kind: "malformed" };
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

  // Keys use forward slashes, matching the lockfile's own keys.
  private async scanSubtrees(
    root: string,
    subtrees: string[],
    opts: { hash: boolean },
  ): Promise<SubtreeScan> {
    const hashes: DeployedFileHashes = {};
    let fileCount = 0;
    const walk = async (rel: string): Promise<void> => {
      const entries = await readdir(join(root, rel), {
        withFileTypes: true,
      }).catch((error: unknown) => {
        if (isMissing(error)) {
          return [];
        }
        throw new DeployedSubtreeUnreadableError();
      });
      for (const entry of entries) {
        const childRel = `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
          await walk(childRel);
          continue;
        }
        fileCount++;
        const abs = join(root, childRel);
        if (opts.hash) {
          // Raw bytes, never utf8: decoding would flag a binary asset as drift.
          let bytes: Buffer;
          try {
            bytes = await readFile(abs);
          } catch {
            throw new DeployedSubtreeUnreadableError();
          }
          hashes[childRel] =
            `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        } else {
          // Probe readability, so the unreadable refusal survives (#59).
          try {
            await access(abs, constants.R_OK);
          } catch {
            throw new DeployedSubtreeUnreadableError();
          }
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
