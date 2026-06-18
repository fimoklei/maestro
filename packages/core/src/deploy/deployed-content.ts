// Adapter: classify the deployed copy (the destination) against what apm last
// recorded for it in the target lockfile's deployed_file_hashes (apm 0.20.0).
// Like InventoryGitAdapter, this is the rare core adapter that touches Node I/O
// directly (node:fs/node:crypto) rather than through a port — it walks a real
// directory tree and hashes files, which no shared port models. The source-side
// guard (InventoryGitPort) cannot see this: it checks the inventory clone, not
// the deployed tree a same-ref apm install would silently reset (#56).
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { claudeSkillName, parseLockfile } from "../lockfile/lockfile";
import type {
  DeployedContentPort,
  DeployedContentState,
  DeployTarget,
} from "./deploy-skill";
import {
  classifyDeployedDrift,
  type DeployedFileHashes,
} from "./deployed-content-drift";

// The deployed subtrees a deploy will overwrite for a skill. Fixed by the
// driver's `-t claude,codex`, not by what the lockfile recorded: scanning these
// catches an edited copy even when a prior single-tool install left it
// unrecorded (apm writes claude to .claude and codex to .agents — apm-driver.md).
function deployTargetSubtrees(name: string): string[] {
  return [`.claude/skills/${name}`, `.agents/skills/${name}`];
}

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
  }): Promise<DeployedContentState> {
    // The real invariant is the deploy targets on disk, not what the lockfile
    // recorded. Scan every subtree the deploy will overwrite (.claude AND
    // .agents) first, then decide against the baseline (#56).
    const root = this.deps.resolveDeployedRoot(input.target);
    const liveHashes: DeployedFileHashes = {};
    try {
      for (const subtree of deployTargetSubtrees(input.name)) {
        Object.assign(liveHashes, await this.hashSubtree(root, subtree));
      }
    } catch (error) {
      // An existing-but-unreadable subtree is not "nothing deployed": we cannot
      // prove it safe to overwrite, so refuse instead of proceeding (#59).
      if (error instanceof DeployedSubtreeUnreadableError) {
        return "unreadable";
      }
      throw error;
    }

    const baseline = await this.readBaseline(input.target, input.name);
    // A present but unparseable lockfile is a visible error, checked before the
    // empty-disk shortcut below: a malformed lockfile must never pass as
    // "not-deployed" and let a deploy proceed against an unknown baseline (#58).
    if (baseline.kind === "malformed") {
      return "lockfile-malformed";
    }
    // Nothing on disk across both deploy targets: there is nothing a deploy
    // could overwrite, so this is a first deploy regardless of what the lockfile
    // recorded. A fully-deleted copy that still has recorded hashes lands here
    // too — restore it, don't refuse it as "local edits" (ADR-0006, #65).
    if (Object.keys(liveHashes).length === 0) {
      return "not-deployed";
    }
    // Files sit in the deploy targets but there are no recorded hashes to verify
    // them against (no entry, or a pre-0.20.0 entry): a deploy would overwrite
    // them blindly, so refuse rather than treat them as a clean first install.
    if (baseline.kind !== "hashes") {
      return "unverifiable";
    }
    return classifyDeployedDrift(baseline.hashes, liveHashes);
  }

  // The skill's recorded baseline: "none" (no lockfile or no matching entry),
  // "malformed" (a present lockfile that does not parse — a visible error, never
  // swallowed to empty), "unverifiable" (an entry with no recorded hashes — a
  // pre-0.20.0 install), or the per-file hashes across every deployed copy.
  private async readBaseline(
    target: DeployTarget,
    name: string,
  ): Promise<
    | { kind: "none" }
    | { kind: "malformed" }
    | { kind: "unverifiable" }
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
    const hashes = entry.deployed_file_hashes;
    if (hashes === undefined || Object.keys(hashes).length === 0) {
      return { kind: "unverifiable" };
    }
    return { kind: "hashes", hashes };
  }

  // Recursively sha256 every file under <root>/<subtree>, keyed by the path
  // relative to <root> with forward slashes — matching the lockfile keys. A
  // missing subtree yields {}, so every recorded file reads as gone (diverged).
  private async hashSubtree(
    root: string,
    subtree: string,
  ): Promise<DeployedFileHashes> {
    const out: DeployedFileHashes = {};
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
        } else {
          // Hash the raw bytes: apm records a byte-for-byte sha256, so reading
          // as utf8 would mangle a binary asset and falsely flag it as drift. A
          // read that fails mid-walk is an unreadable destination, not absence —
          // refuse rather than miscategorise it as an apm execution failure (#59).
          let bytes: Buffer;
          try {
            bytes = await readFile(join(root, childRel));
          } catch {
            throw new DeployedSubtreeUnreadableError();
          }
          out[childRel] =
            `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        }
      }
    };
    await walk(subtree);
    return out;
  }
}
