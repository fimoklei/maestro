// Adapter: classify the deployed copy (the destination) against what apm last
// recorded for it in the target lockfile's deployed_file_hashes (apm 0.20.0).
// Like InventoryGitAdapter, this is the rare core adapter that touches Node I/O
// directly (node:fs/node:crypto) rather than through a port — it walks a real
// directory tree and hashes files, which no shared port models. The source-side
// guard (InventoryGitPort) cannot see this: it checks the inventory clone, not
// the deployed tree a same-ref apm install would silently reset (#56).

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { claudeSkillName, parseLockfile } from "../lockfile/lockfile";
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

// Thrown when a deploy subtree exists but cannot be walked or read (anything but
// a genuinely-missing directory). classify catches it and reports "unreadable"
// so the guard refuses, rather than letting the error swallow to empty and a
// deploy silently overwrite what we could not verify (#59).
class DeployedSubtreeUnreadableError extends Error {}

// A missing directory (ENOENT) is the intended "nothing deployed here" case and
// reads as empty. Any other failure means the destination exists but cannot be
// read — that must fail loud, not pass as empty.
function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

// What a walk of the deploy subtrees found: the per-file hashes (empty unless
// hashing was requested) and how many files exist. fileCount is what tells a
// first deploy (nothing to overwrite) from a copy on disk, independent of
// whether we hashed anything.
type SubtreeScan = { hashes: DeployedFileHashes; fileCount: number };

export class DeployedContentAdapter implements DeployedContentPort {
  private readonly deps: {
    // Where the target's apm.lock.yaml lives. Per-repo: <repoPath>/apm.lock.yaml.
    // Global: <apmGlobalRoot>/apm.lock.yaml.
    resolveLockfilePath: (target: DeployTarget) => string;
    // The root the deployed_file_hashes keys are relative to. Per-repo: the repo.
    // Global: the home dir, since apm deploys to ~/.claude/skills (apm-driver.md).
    resolveDeployedRoot: (target: DeployTarget) => string;
  };

  constructor(deps: DeployedContentAdapter["deps"]) {
    this.deps = deps;
  }

  async classify(input: {
    target: DeployTarget;
    name: string;
    tools?: readonly SupportedTool[];
  }): Promise<DeployedContentState> {
    // Which deployed copies this deploy touches. The global path scopes to the
    // detected tools; the repo path leaves it undefined and scans every tool
    // (deployTargetSubtrees defaults to all — #136).
    const subtrees = deployTargetSubtrees(input.name, input.tools);
    // Read the cheap one-file baseline first: it decides whether the deploy
    // subtrees need their contents hashed at all. With no recorded hashes to
    // compare against, only the existence of deployed files matters, so the scan
    // skips the content hashing entirely (#63). The recorded baseline is scoped
    // to the same subtrees, so an untargeted tool's hashes — left by a prior
    // two-tool install — never count as this deploy's drift (ADR-0011, #136).
    const baseline = await this.readBaseline(
      input.target,
      input.name,
      subtrees,
    );
    const root = this.deps.resolveDeployedRoot(input.target);
    let scan: SubtreeScan;
    try {
      scan = await this.scanSubtrees(root, subtrees, {
        hash: baseline.kind === "hashes",
      });
    } catch (error) {
      // An existing-but-unreadable subtree is not "nothing deployed": we cannot
      // prove it safe to overwrite, so refuse instead of proceeding (#59). This
      // is checked before the baseline branches so an unreadable destination
      // outranks a malformed lockfile, exactly as before the reorder.
      if (error instanceof DeployedSubtreeUnreadableError) {
        return "unreadable";
      }
      throw error;
    }

    // A present but unparseable lockfile is a visible error: a malformed lockfile
    // must never pass as "not-deployed" and let a deploy proceed against an
    // unknown baseline (#58).
    if (baseline.kind === "malformed") {
      return "lockfile-malformed";
    }
    // Nothing on disk across both deploy targets: there is nothing a deploy could
    // overwrite, so this is a first deploy regardless of what the lockfile
    // recorded. A fully-deleted copy that still has recorded hashes lands here
    // too — restore it, don't refuse it as "local edits" (ADR-0006, #65).
    if (scan.fileCount === 0) {
      return "not-deployed";
    }
    // Files sit in the deploy targets but there are no recorded hashes to verify
    // them against (no entry, or a pre-0.20.0 entry): a deploy would overwrite
    // them blindly, so refuse rather than treat them as a clean first install.
    if (baseline.kind !== "hashes") {
      return "unverifiable";
    }
    return classifyDeployedDrift(baseline.hashes, scan.hashes);
  }

  // The skill's recorded baseline: "malformed" (a present lockfile that does not
  // parse — a visible error, never swallowed to empty), the per-file "hashes"
  // across every deployed copy, or "none" for everything else (no lockfile, no
  // matching entry, or a pre-0.20.0 entry with no recorded hashes). The last
  // three all mean the same thing to the classifier — no per-file baseline to
  // verify against — so they share one kind rather than a distinction that never
  // changes the outcome (#63).
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
      raw = await readFile(this.deps.resolveLockfilePath(target), "utf8");
    } catch (error) {
      // A genuinely missing lockfile is the legitimate "nothing recorded" case.
      // Any other read failure means the file is there but we cannot read it —
      // that is a visible error, not an absent baseline (#58).
      if (isMissing(error)) {
        return { kind: "none" };
      }
      return { kind: "malformed" };
    }

    const parsed = parseLockfile(raw);
    if (!parsed.ok) {
      return { kind: "malformed" };
    }

    const entry = parsed.entries.find((e) => claudeSkillName(e) === name);
    if (entry === undefined) {
      return { kind: "none" };
    }
    const recorded = entry.deployed_file_hashes;
    if (recorded === undefined || Object.keys(recorded).length === 0) {
      // A pre-0.20.0 entry with no recorded hashes: an entry exists but carries
      // no per-file baseline, so it verifies no better than no entry at all.
      return { kind: "none" };
    }
    // Keep only the hashes under the targeted subtrees. On the scoped global
    // path this drops an untargeted tool's recorded copy so its absence on disk
    // is not read as drift; unscoped, every subtree is targeted so nothing drops
    // (ADR-0011, #136).
    const hashes = scopeHashesToSubtrees(recorded, subtrees);
    if (Object.keys(hashes).length === 0) {
      // The lockfile records copies, but none under a targeted subtree — no
      // per-file baseline for this deploy, same as a pre-0.20.0 entry.
      return { kind: "none" };
    }
    return { kind: "hashes", hashes };
  }

  // Walk every deploy subtree for the skill and report what's there. When
  // `hash` is set, sha256 each file's raw bytes (keyed relative to <root>, with
  // forward slashes, matching the lockfile keys) so the result can be compared
  // against the recorded baseline. When it is not, the content is never read —
  // only existence and readability matter — so the expensive hashing is skipped
  // (#63). A missing subtree yields nothing (the intended empty case).
  private async scanSubtrees(
    root: string,
    subtrees: string[],
    opts: { hash: boolean },
  ): Promise<SubtreeScan> {
    const hashes: DeployedFileHashes = {};
    let fileCount = 0;
    const walk = async (rel: string): Promise<void> => {
      // A missing directory (deployed copy deleted, or never created) yields no
      // entries — the intended empty case. Any other readdir failure means the
      // directory exists but cannot be read: fail loud so the guard refuses.
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
          // Hash the raw bytes: apm records a byte-for-byte sha256, so reading as
          // utf8 would mangle a binary asset and falsely flag it as drift
          // (apm-driver.md). A read
          // that fails mid-walk is an unreadable destination, not absence —
          // refuse rather than miscategorise it as an apm execution failure (#59).
          let bytes: Buffer;
          try {
            bytes = await readFile(abs);
          } catch {
            throw new DeployedSubtreeUnreadableError();
          }
          hashes[childRel] =
            `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        } else {
          // No baseline to compare against, so the content is irrelevant — but an
          // unreadable file is still an unreadable destination, not a blindly
          // overwritable one. Probe readability without reading the bytes so the
          // unreadable refusal (#59) survives skipping the hash (#63).
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

// Keep only the recorded hashes whose key sits inside one of the targeted
// subtrees (`<prefix>/skills/<name>/...`). A subtree path is itself the prefix;
// appending "/" avoids a sibling like ".claude/skills/tddx" matching ".../tdd".
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
