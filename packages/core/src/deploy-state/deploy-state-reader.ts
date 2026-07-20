// Reads a consuming repo's deploy-state: the primitives apm has installed into
// it, surfaced as { type, name, version }. It reads the repo's apm.lock.yaml
// through the FileSystemPort and never the network. The version shown is the
// human tag (resolved_ref), never a commit hash. Three honest outcomes the
// cockpit must never blur: a missing lockfile is "nothing deployed" (empty), an
// entry of an unsupported package_type is skipped (and surfaced), and a
// malformed lockfile is a visible error — an empty list must never stand in for
// "I couldn't read this".
import { join } from "node:path";
import { claudeSkillName, parseLockfile } from "../lockfile/lockfile";
import type { FileSystemPort } from "../registry/file-system";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import type { DeployedPrimitive, SkippedEntry } from "./deploy-state-types";
import {
  groupPrimitivesByTool,
  type ToolDeployState,
} from "./group-primitives-by-tool";

export type { DeployedPrimitive, SkippedEntry } from "./deploy-state-types";

type DeployStateResult =
  | { ok: true; primitives: DeployedPrimitive[]; skipped: SkippedEntry[] }
  | { ok: false; error: "malformed" };

// The global (user-scope) read: state grouped per detected tool, plus the
// detected-tool set (implicit in `tools`). Same three honest outcomes as the
// per-repo read — a missing lockfile is each detected tool an empty group (not
// an error), a malformed one is a visible error (ADR-0011, J03).
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
    const skipped: SkippedEntry[] = [];
    for (const entry of parsed.entries) {
      const name = claudeSkillName(entry);
      if (name === null) {
        skipped.push({
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

// The global read on its own type, so the tool-presence dependency it cannot
// work without is required by the constructor. A caller that omits it fails to
// compile instead of answering 500 under a lane nobody runs (#187). The
// per-repo read stays on the base class, so a caller that never reads global
// state still constructs with just { fs }.
export class GlobalDeployStateReader extends DeployStateReader {
  private readonly toolPresence: ToolPresencePort;

  constructor(deps: { fs: FileSystemPort; toolPresence: ToolPresencePort }) {
    super(deps);
    this.toolPresence = deps.toolPresence;
  }

  // Reads the user-scope lockfile at `rootPath` and groups its entries per
  // detected tool (ADR-0011). The server resolves rootPath itself; no client
  // path reaches here. Detection is live per read (the presence port), so a tool
  // installed since startup shows up without a restart.
  async readGlobal(rootPath: string): Promise<GlobalDeployStateResult> {
    const detected = await this.toolPresence.detectGlobalTools();
    const raw = await this.fs.readFile(join(rootPath, "apm.lock.yaml"));
    if (raw === null) {
      // Nothing deployed yet: each detected tool is an honest empty group, never
      // an error and never a tool the machine does not have.
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
    return { ok: true, ...groupPrimitivesByTool(parsed.entries, detected) };
  }
}
