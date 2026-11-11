// Probes each tool's own config file, so a past deploy never reads back as an
// installed tool (#127).
import { DEPLOY_TOOLS, type SupportedTool } from "../deploy/deploy-tools";
import type { DeployedLocation } from "../deploy/deployed-location";
import { isFile } from "../filesystem/is-file";
import type { ToolPresencePort } from "./tool-presence-port";

export class ToolPresenceAdapter implements ToolPresencePort {
  // The location Global's reads and writes use, so a marker moved with
  // CLAUDE_CONFIG_DIR is probed where apm writes.
  private readonly location: Pick<DeployedLocation, "presenceMarkers">;

  constructor(deps: { location: Pick<DeployedLocation, "presenceMarkers"> }) {
    this.location = deps.location;
  }

  async detectGlobalTools(): Promise<SupportedTool[]> {
    const markers = this.location.presenceMarkers();
    const detected: SupportedTool[] = [];
    for (const tool of DEPLOY_TOOLS) {
      if (await isFile(markers[tool.apmTarget])) {
        detected.push(tool.apmTarget);
      }
    }
    return detected;
  }
}
