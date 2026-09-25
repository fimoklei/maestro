// Probes each tool's own config file, so a past deploy never reads back as an
// installed tool (#127).
import { join } from "node:path";
import { DEPLOY_TOOLS, type SupportedTool } from "../deploy/deploy-tools";
import { isFile } from "../filesystem/is-file";
import { resolveHomeDirectory } from "../home-directory";
import type { ToolPresencePort } from "./tool-presence-port";

export class ToolPresenceAdapter implements ToolPresencePort {
  // Must match the home DeployedLocation and resolveApmGlobalRoot use.
  private readonly homeRoot: () => string;

  constructor(deps?: { homeRoot?: () => string }) {
    this.homeRoot = deps?.homeRoot ?? resolveHomeDirectory;
  }

  async detectGlobalTools(): Promise<SupportedTool[]> {
    const home = this.homeRoot();
    const detected: SupportedTool[] = [];
    for (const tool of DEPLOY_TOOLS) {
      if (await isFile(join(home, tool.globalPresenceMarker))) {
        detected.push(tool.apmTarget);
      }
    }
    return detected;
  }
}
