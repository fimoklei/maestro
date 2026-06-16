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

// The deployed subtrees a deploy will overwrite for a skill. Fixed by the
// driver's `-t claude,codex`, not by what the lockfile recorded: scanning these
// catches an edited copy even when a prior single-tool install left it
// unrecorded (apm writes claude to .claude and codex to .agents — apm-driver.md).
function deployTargetSubtrees(name: string): string[] {
  return [`.claude/skills/${name}`, `.agents/skills/${name}`];
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
    const baseline = await this.readBaseline(input.target, input.name);
    // No lockfile or no matching entry: genuinely nothing deployed — a first
    // deploy has nothing to overwrite, so let it through.
    if (baseline.kind === "none") {
      return "not-deployed";
    }
    // A matching entry but no recorded hashes (a pre-0.20.0 install): the
    // deployed copy could hold edits we cannot detect. Refuse rather than risk
    // a silent reset.
    if (baseline.kind === "unverifiable") {
      return "unverifiable";
    }

    // Scan every subtree the deploy will overwrite (.claude AND .agents), so an
    // edit to either copy is caught — including a copy the lockfile never
    // recorded, which would otherwise be reset silently (#56).
    const root = this.deps.resolveDeployedRoot(input.target);
    const liveHashes: DeployedFileHashes = {};
    for (const subtree of deployTargetSubtrees(input.name)) {
      Object.assign(liveHashes, await this.hashSubtree(root, subtree));
    }
    return classifyDeployedDrift(baseline.hashes, liveHashes);
  }

  // The skill's recorded baseline: "none" (no lockfile or no matching entry),
  // "unverifiable" (an entry with no recorded hashes — a pre-0.20.0 install), or
  // the per-file hashes across every deployed copy.
  private async readBaseline(
    target: DeployTarget,
    name: string,
  ): Promise<
    | { kind: "none" }
    | { kind: "unverifiable" }
    | { kind: "hashes"; hashes: DeployedFileHashes }
  > {
    let raw: string;
    try {
      raw = await readFile(this.deps.resolveLockfilePath(target), "utf8");
    } catch {
      return { kind: "none" };
    }

    let data: unknown;
    try {
      data = parse(raw);
    } catch {
      return { kind: "none" };
    }
    const parsed = lockfileSchema.safeParse(data);
    if (!parsed.success) {
      return { kind: "none" };
    }

    const entry = parsed.data.dependencies.find(
      (e) =>
        e.package_type === "claude_skill" && basename(e.virtual_path) === name,
    );
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
