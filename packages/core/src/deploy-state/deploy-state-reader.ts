// Reads a consuming repo's deploy-state: the primitives apm has installed into
// it, surfaced as { type, name, version }. It reads the repo's apm.lock.yaml
// through the FileSystemPort and never the network. The version shown is the
// human tag (resolved_ref), never a commit hash. Three honest outcomes the
// cockpit must never blur: a missing lockfile is "nothing deployed" (empty), an
// entry of an unsupported package_type is skipped (and surfaced), and a
// malformed lockfile is a visible error — an empty list must never stand in for
// "I couldn't read this".
import { basename, join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import type { FileSystemPort } from "../registry/file-system";

export type DeployedPrimitive = {
  type: "skill";
  name: string;
  version: string;
};

// An entry we could parse but whose package_type we don't support yet. Surfaced
// so the cockpit can warn instead of silently dropping it.
export type SkippedEntry = { virtualPath: string; packageType: string };

export type DeployStateResult =
  | { ok: true; primitives: DeployedPrimitive[]; skipped: SkippedEntry[] }
  | { ok: false; error: "malformed" };

const lockfileEntrySchema = z.object({
  resolved_ref: z.string(),
  virtual_path: z.string(),
  package_type: z.string(),
});

const lockfileSchema = z.object({
  dependencies: z.array(lockfileEntrySchema),
});

export class DeployStateReader {
  private readonly fs: FileSystemPort;

  constructor(deps: { fs: FileSystemPort }) {
    this.fs = deps.fs;
  }

  async read(repoPath: string): Promise<DeployStateResult> {
    const raw = await this.fs.readFile(join(repoPath, "apm.lock.yaml"));
    if (raw === null) {
      return { ok: true, primitives: [], skipped: [] };
    }

    let data: unknown;
    try {
      data = parse(raw);
    } catch {
      return { ok: false, error: "malformed" };
    }

    const parsed = lockfileSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, error: "malformed" };
    }

    const primitives: DeployedPrimitive[] = [];
    const skipped: SkippedEntry[] = [];
    for (const entry of parsed.data.dependencies) {
      if (entry.package_type !== "claude_skill") {
        skipped.push({
          virtualPath: entry.virtual_path,
          packageType: entry.package_type,
        });
        continue;
      }
      primitives.push({
        type: "skill",
        name: basename(entry.virtual_path),
        version: entry.resolved_ref,
      });
    }
    return { ok: true, primitives, skipped };
  }
}
