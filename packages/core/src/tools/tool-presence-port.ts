// The port that answers "which supported AI coding tools does this machine
// actually have?" for a GLOBAL deploy (ADR-0011). apm offers no such signal — a
// bare `apm install -g` reads the project cwd, never HOME, and there is no
// command that lists user-level installed tools (spike #127) — so Maestro
// detects presence itself, live on the filesystem. Pure logic depends on this
// interface; the Node adapter (tool-presence.ts) is the only place that touches
// disk (ports & adapters, architecture.md).
import type { SupportedTool } from "../deploy/deploy-tools";

export interface ToolPresencePort {
  // The supported tools detected on this machine, as a subset of DEPLOY_TOOLS in
  // that order. A live probe per call (no caching, no stored list — ADR-0011),
  // resolved against the same HOME the deploy uses so `pnpm smoke` stays honest
  // against its sandbox HOME (ADR-0010). Empty is valid: no supported tool, so a
  // global deploy is refused rather than run for nothing.
  detectGlobalTools(): Promise<SupportedTool[]>;
}
