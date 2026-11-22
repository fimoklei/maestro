import { DEPLOY_TOOLS, type SupportedTool } from "../deploy/deploy-tools";
import type { DeployedLocation } from "../deploy/deployed-location";
import { isFile } from "../filesystem/is-file";
import type { ToolPresencePort } from "./tool-presence-port";

export class ToolPresenceAdapter implements ToolPresencePort {
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
