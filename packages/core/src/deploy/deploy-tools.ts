// Single source of truth for which tools a skill deploy targets. apm installs to
// all of them in one action (`-t <tokens>`) and materializes one copy per tool
// under its own directory; the destination guard must scan exactly those copies;
// and global tool-presence detection probes exactly this set (ADR-0011). All
// three facts derive from DEPLOY_TOOLS here, so adding a tool updates the install
// flag, the scanned subtrees, and the presence probe together — it can never
// update one and silently stop guarding the others (#63, #131).

// The identity of a deployable tool — apm's own `-t` token (apm-driver.md).
export type SupportedTool = "claude" | "codex";

export type DeployTool = {
  // The token apm expects in its `-t` flag, and this tool's identity.
  apmTarget: SupportedTool;
  // The directory apm materializes this tool's copy under, relative to the
  // deployed root. codex deploys to the cross-client ".agents" dir, not ".codex"
  // (apm-driver.md, 01.2 spike).
  skillsDirPrefix: string;
  // The HOME-relative file whose existence proves this tool is installed
  // globally (spike #127). Deploy-immune: it is the tool's own config, never a
  // skills directory a Maestro deploy creates. Do NOT key on ".claude"/".codex"
  // (dirs) or ".agents" — a deploy writes those (ADR-0011).
  globalPresenceMarker: string;
};

export const DEPLOY_TOOLS: readonly DeployTool[] = [
  {
    apmTarget: "claude",
    skillsDirPrefix: ".claude",
    globalPresenceMarker: ".claude.json",
  },
  {
    apmTarget: "codex",
    skillsDirPrefix: ".agents",
    globalPresenceMarker: ".codex/config.toml",
  },
];

// The `-t` flag value for an apm install: every tool's token, comma-joined.
// Repeating the flag (`-t a -t b`) is unsupported by apm (last wins), so a
// single comma list is the contract (apm-driver.md).
export const APM_DEPLOY_TARGET_FLAG = DEPLOY_TOOLS.map(
  (tool) => tool.apmTarget,
).join(",");

// The `-t` value for a GLOBAL install, built from the tools actually detected on
// the machine (ADR-0011) — a Claude-only machine gets "claude", never
// "claude,codex" writing a dead .agents/ tree. Filters and orders against
// DEPLOY_TOOLS so this file still owns the token set and its order; an unknown
// token is dropped. Empty when no tool is detected — the caller refuses the
// deploy before apm runs, so apm never receives a bare (multi-harness) install.
export function apmTargetFlagForTools(tools: readonly SupportedTool[]): string {
  return DEPLOY_TOOLS.filter((tool) => tools.includes(tool.apmTarget))
    .map((tool) => tool.apmTarget)
    .join(",");
}

// The deployed subtrees a skill of <name> occupies — one per deploy tool, keyed
// relative to the deployed root, matching the lockfile's deployed_file_hashes.
export function deployTargetSubtrees(name: string): string[] {
  return DEPLOY_TOOLS.map((tool) => `${tool.skillsDirPrefix}/skills/${name}`);
}
