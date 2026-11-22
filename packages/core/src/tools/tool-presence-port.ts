import type { SupportedTool } from "../deploy/deploy-tools";

export interface ToolPresencePort {
  detectGlobalTools(): Promise<SupportedTool[]>;
}
