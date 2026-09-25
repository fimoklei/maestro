// Maestro detects tool presence itself: apm offers no signal for it (#127).
import type { SupportedTool } from "../deploy/deploy-tools";

export interface ToolPresencePort {
  // A live probe per call, never cached.
  detectGlobalTools(): Promise<SupportedTool[]>;
}
