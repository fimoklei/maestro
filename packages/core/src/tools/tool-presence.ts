// Adapter: detect which supported tools are installed globally by probing each
// tool's own config file under HOME (spike #127). Like the other filesystem
// adapters in core (DeployedContentAdapter, InventoryGitAdapter) it touches
// node:fs directly rather than through a port — a single stat per tool, which no
// shared port models. The signal is deploy-immune: it keys on the tool's config
// file (`~/.claude.json`, `~/.codex/config.toml`), never on a skills directory a
// Maestro deploy creates, so a past deploy never reads back as an installed tool
// (ADR-0011). HOME is injected so a test or `pnpm smoke` run probes a sandbox
// HOME and never the real home (ADR-0010).
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DEPLOY_TOOLS, type SupportedTool } from "../deploy/deploy-tools";
import type { ToolPresencePort } from "./tool-presence-port";

export class ToolPresenceAdapter implements ToolPresencePort {
  // Resolves the home root a global deploy targets. Defaults to $HOME (then the
  // OS home), matching resolveDeployedRoot/resolveApmGlobalRoot so detection and
  // the deploy it feeds always agree on which home they mean.
  private readonly homeRoot: () => string;

  constructor(deps?: { homeRoot?: () => string }) {
    this.homeRoot = deps?.homeRoot ?? (() => process.env.HOME ?? homedir());
  }

  async detectGlobalTools(): Promise<SupportedTool[]> {
    const home = this.homeRoot();
    const detected: SupportedTool[] = [];
    // Iterate DEPLOY_TOOLS so the result is a subset in that order by
    // construction — the single source of truth owns the set and its order.
    for (const tool of DEPLOY_TOOLS) {
      if (await isFile(join(home, tool.globalPresenceMarker))) {
        detected.push(tool.apmTarget);
      }
    }
    return detected;
  }
}

// True only when the path exists and is a regular file. A missing marker (the
// common "tool not installed" case) is false, not an error; a directory at the
// marker path is not the config file, so it is not a signal either.
async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
