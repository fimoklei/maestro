// Adapter: classify the deployed copy (the destination) against what apm last
// recorded for it in the target lockfile's deployed_file_hashes (apm 0.20.0).
// Like InventoryGitAdapter, this is the rare core adapter that touches Node I/O
// directly (node:fs/node:crypto) rather than through a port — it walks a real
// directory tree and hashes files, which no shared port models. The source-side
// guard (InventoryGitPort) cannot see this: it checks the inventory clone, not
// the deployed tree a same-ref apm install would silently reset (#56).
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type {
  DeployedContentPort,
  DeployedContentState,
  DeployTarget,
} from "./deploy-skill";
import {
  classifyDeployedDrift,
  type DeployedFileHashes,
} from "./deployed-content-drift";

// The distinct deployed subtree roots a lockfile records for a skill, derived
// from its hash keys — e.g. ".claude/skills/tdd" and ".agents/skills/tdd" for a
// two-tool install. Walking each catches an untracked file in either copy.
function deployedSubtrees(lockKeys: string[], name: string): string[] {
  const marker = `skills/${name}`;
  const roots = new Set<string>();
  for (const key of lockKeys) {
    const idx = key.indexOf(marker);
    if (idx !== -1) {
      roots.add(key.slice(0, idx + marker.length));
    }
  }
  return [...roots];
}

const lockfileSchema = z.object({
  dependencies: z.array(
    z.object({
      virtual_path: z.string(),
      package_type: z.string(),
      deployed_file_hashes: z.record(z.string(), z.string()).optional(),
    }),
  ),
});

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
    const lockHashes = await this.readLockHashes(input.target, input.name);
    // No lockfile, no entry, or no recorded hashes (a pre-0.20.0 install): we
    // have no baseline to compare, so there is nothing to overwrite-protect.
    if (lockHashes === null) {
      return "not-deployed";
    }

    // A deploy runs `-t claude,codex`, overwriting every recorded copy (.claude
    // AND .agents). Walk each distinct deployed subtree the lockfile records, so
    // an edit to either copy is caught — not just the .claude one (#56).
    const root = this.deps.resolveDeployedRoot(input.target);
    const liveHashes: DeployedFileHashes = {};
    for (const subtree of deployedSubtrees(
      Object.keys(lockHashes),
      input.name,
    )) {
      Object.assign(liveHashes, await this.hashSubtree(root, subtree));
    }
    return classifyDeployedDrift(lockHashes, liveHashes);
  }

  // The skill's recorded per-file hashes across every deployed copy, or null
  // when there is no baseline (no lockfile, no matching entry, or a pre-0.20.0
  // install that recorded no hashes).
  private async readLockHashes(
    target: DeployTarget,
    name: string,
  ): Promise<DeployedFileHashes | null> {
    let raw: string;
    try {
      raw = await readFile(this.deps.resolveLockfilePath(target), "utf8");
    } catch {
      return null;
    }

    let data: unknown;
    try {
      data = parse(raw);
    } catch {
      return null;
    }
    const parsed = lockfileSchema.safeParse(data);
    if (!parsed.success) {
      return null;
    }

    const entry = parsed.data.dependencies.find(
      (e) =>
        e.package_type === "claude_skill" && basename(e.virtual_path) === name,
    );
    if (entry?.deployed_file_hashes === undefined) {
      return null;
    }
    const hashes = entry.deployed_file_hashes;
    return Object.keys(hashes).length === 0 ? null : hashes;
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
      // A missing subtree (deployed copy deleted) yields no entries, so every
      // recorded file reads as gone downstream — diverged, not a crash.
      const entries = await readdir(join(root, rel), {
        withFileTypes: true,
      }).catch(() => []);
      for (const entry of entries) {
        const childRel = `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
          await walk(childRel);
        } else {
          // Hash the raw bytes: apm records a byte-for-byte sha256, so reading
          // as utf8 would mangle a binary asset and falsely flag it as drift.
          const bytes = await readFile(join(root, childRel));
          out[childRel] =
            `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
        }
      }
    };
    await walk(subtree);
    return out;
  }
}
