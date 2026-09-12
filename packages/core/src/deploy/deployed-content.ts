// Classifies the deployed copy against the lockfile's deployed_file_hashes, and
// names a destination apm refuses because it is a symlink.
// Touches node:fs directly rather than through a port — no port models walking
// and hashing a tree. See #56.

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

// ENOENT is the intended "nothing deployed here"; every other failure must fail
// loud, not pass as empty.
function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

// `fileCount` tells a first deploy from a copy on disk independent of whether
// anything was hashed; `hashes` is empty unless hashing was requested.
type SubtreeScan = { hashes: DeployedFileHashes; fileCount: number };

export class DeployedContentAdapter implements DeployedContentPort {
  private readonly deps: {
    // Shared with DeployedCleanupAdapter so the guard and the cleanup always
    // agree on the tree.
    location: Pick<DeployedLocation, "treeRoot" | "lockfilePath">;
  };

  constructor(deps: DeployedContentAdapter["deps"]) {
    this.deps = deps;
  }

  async classify(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }): Promise<DeployedContentState> {
    const subtrees = deployTargetSubtrees(input.name, input.tools);
    // Baseline first: with no recorded hashes only existence matters, so the
    // scan can skip hashing entirely (#63).
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
    // Nothing on disk outranks recorded hashes: a fully-deleted copy is restored,
    // never refused as "local edits" (ADR-0006, #65).
    if (scan.fileCount === 0) {
      return "not-deployed";
    }
    // Files with no baseline to verify them: a deploy would overwrite blindly.
    if (baseline.kind !== "hashes") {
      return "unverifiable";
    }
    return classifyDeployedDrift(baseline.hashes, scan.hashes);
  }

  // apm refuses the install when the *leaf* skill dir is a symlink, and names
  // the path only in prose Maestro never forwards (apm-behavior.md § Install
  // signals (3), ADR-0018). lstat, not stat: following the link would report a
  // real directory (#748).
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

  // "none" covers no lockfile, no entry, and a pre-0.20.0 entry alike: all three
  // mean no per-file baseline, and the distinction changes no outcome (#63).
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
      // A lockfile that is there but unreadable is a visible error, not an
      // absent baseline (#58).
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

    // By name, never by package_type: the copy on disk belongs to this skill
    // whatever apm recorded it as, and a hybrid record's hashes are still its
    // baseline (#358).
    // A root package records every skill it deployed in one row, so its hashes
    // are this skill's baseline too, scoped to the subtrees below (ADR-0031).
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
    // Drops an untargeted tool's recorded copy, so its absence on disk is not
    // read as drift (ADR-0011, #136).
    const hashes = scopeHashesToSubtrees(recorded, subtrees);
    if (Object.keys(hashes).length === 0) {
      return { kind: "none" };
    }
    return { kind: "hashes", hashes };
  }

  // Hash keys are relative to <root> with forward slashes, matching the
  // lockfile's own keys.
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
          // Raw bytes, never utf8: apm records a byte-for-byte sha256, and
          // decoding would flag a binary asset as drift (apm-behavior.md
          // § Lockfile).
          let bytes: Buffer;
          try {
            bytes = await readFile(abs);
          } catch {
            throw new DeployedSubtreeUnreadableError();
          }
          hashes[childRel] =
            `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        } else {
          // Probe readability without reading the bytes, so the unreadable
          // refusal (#59) survives skipping the hash (#63).
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

// The trailing "/" matters: without it ".claude/skills/tddx" matches ".../tdd".
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
