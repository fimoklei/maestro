// Probes each tool's own config file under HOME, so a past deploy can never read
// back as an installed tool (ADR-0011, #127). HOME is injected, so a test or
// smoke run never probes the real home (ADR-0010).
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { DEPLOY_TOOLS, type SupportedTool } from "../deploy/deploy-tools";
import { resolveHomeDirectory } from "../home-directory";
import type { ToolPresencePort } from "./tool-presence-port";

export class ToolPresenceAdapter implements ToolPresencePort {
  // Matches DeployedLocation and resolveApmGlobalRoot, so detection and the
  // deploy it feeds agree on which home they mean.
  private readonly homeRoot: () => string;

  constructor(deps?: { homeRoot?: () => string }) {
    this.homeRoot = deps?.homeRoot ?? resolveHomeDirectory;
  }

  async detectGlobalTools(): Promise<SupportedTool[]> {
    const home = this.homeRoot();
    const detected: SupportedTool[] = [];
    // Iterated in DEPLOY_TOOLS order, so the result is a subset by construction.
    for (const tool of DEPLOY_TOOLS) {
      if (await isFile(join(home, tool.globalPresenceMarker))) {
        detected.push(tool.apmTarget);
      }
    }
    return detected;
  }
}

// A missing marker is false, not an error; a directory there is not the config
// file, so it is not a signal either.
async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
