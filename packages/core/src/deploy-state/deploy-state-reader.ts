// Reads a target's apm.lock.yaml, never the network. Three outcomes the cockpit
// must never blur: missing is "nothing deployed", an unsupported package_type is
// skipped and surfaced, and malformed is a visible error (#58).
import { join } from "node:path";
import {
  claudeSkillName,
  parseLockfile,
  type UnreadableEntry,
} from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { DeployedPrimitive, SkippedEntry } from "./deploy-state-types";
import {
  groupPrimitivesByTool,
  type ToolDeployState,
} from "./group-primitives-by-tool";

type DeployStateResult =
  | { ok: true; primitives: DeployedPrimitive[]; skipped: SkippedEntry[] }
  | { ok: false; error: "malformed" };

// Grouped per detected tool, which also carries the detected set (ADR-0011).
type GlobalDeployStateResult =
  | { ok: true; tools: ToolDeployState[]; skipped: SkippedEntry[] }
  | { ok: false; error: "malformed" };

export class DeployStateReader {
  protected readonly fs: FileSystemPort;

  constructor(deps: { fs: FileSystemPort }) {
    this.fs = deps.fs;
  }

  async read(repoPath: string): Promise<DeployStateResult> {
    const raw = await this.fs.readFile(join(repoPath, "apm.lock.yaml"));
    if (raw === null) {
      return { ok: true, primitives: [], skipped: [] };
    }

    const parsed = parseLockfile(raw);
    if (!parsed.ok) {
      return { ok: false, error: "malformed" };
    }

    const primitives: DeployedPrimitive[] = [];
    const skipped: SkippedEntry[] = unreadableAsSkipped(parsed.unreadable);
    for (const entry of parsed.entries) {
      const name = claudeSkillName(entry);
      if (name === null) {
        skipped.push({
          reason: "unsupported-type",
          virtualPath: entry.virtual_path,
          packageType: entry.package_type,
        });
        continue;
      }
      primitives.push({
        type: "skill",
        name,
        version: entry.resolved_ref,
      });
    }
    return { ok: true, primitives, skipped };
  }
}

function unreadableAsSkipped(
  unreadable: readonly UnreadableEntry[],
): SkippedEntry[] {
  return unreadable.map((entry) => ({
    reason: "unreadable",
    virtualPath: entry.virtualPath,
  }));
}

// A separate type so the tool-presence dependency is required by the
// constructor: omitting it fails to compile rather than 500 at runtime (#187).
export class GlobalDeployStateReader extends DeployStateReader {
  private readonly toolPresence: ToolPresencePort;

  constructor(deps: { fs: FileSystemPort; toolPresence: ToolPresencePort }) {
    super(deps);
    this.toolPresence = deps.toolPresence;
  }

  // `rootPath` is server-resolved; no client path reaches here. Detection is
  // live per read, so a tool installed since startup needs no restart.
  async readGlobal(rootPath: string): Promise<GlobalDeployStateResult> {
    const detected = await this.toolPresence.detectGlobalTools();
    const raw = await this.fs.readFile(join(rootPath, "apm.lock.yaml"));
    if (raw === null) {
      // Nothing deployed yet: an empty group per detected tool, never an error
      // and never a tool the machine does not have.
      return {
        ok: true,
        tools: detected.map((tool) => ({ tool, primitives: [] })),
        skipped: [],
      };
    }

    const parsed = parseLockfile(raw);
    if (!parsed.ok) {
      return { ok: false, error: "malformed" };
    }
    const grouped = groupPrimitivesByTool(parsed.entries, detected);
    return {
      ok: true,
      tools: grouped.tools,
      skipped: [...unreadableAsSkipped(parsed.unreadable), ...grouped.skipped],
    };
  }
}
