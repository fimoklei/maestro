// Maestro detects tool presence itself: apm offers no signal for it (#127).
import type { SupportedTool } from "../deploy/deploy-tools";

export interface ToolPresencePort {
  // A live probe per call — no caching, no stored list (ADR-0011). Empty is
  // valid: a global deploy is then refused rather than run for nothing.
  detectGlobalTools(): Promise<SupportedTool[]>;
}
