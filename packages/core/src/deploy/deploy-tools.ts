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

// The deployed subtrees a skill of <name> occupies, keyed relative to the
// deployed root and matching the lockfile's deployed_file_hashes. With `tools`,
// the set is scoped to exactly those tools' copies — the GLOBAL destination
// guard must scan only the tools a deploy targets, so an absent untargeted copy
// (a Claude-only redeploy over a prior two-tool lockfile) is never read as drift
// (ADR-0011, #136). Without `tools` (repo path, #111 read-path) it stays every
// DEPLOY_TOOLS tool — the pre-#136 behaviour. Filters and orders against
// DEPLOY_TOOLS so this file still owns the set and its order; unknown tokens drop.
export function deployTargetSubtrees(
  name: string,
  tools?: readonly SupportedTool[],
): string[] {
  return DEPLOY_TOOLS.filter(
    (tool) => tools === undefined || tools.includes(tool.apmTarget),
  ).map((tool) => `${tool.skillsDirPrefix}/skills/${name}`);
}

// The supported tools a machine does NOT have, in DEPLOY_TOOLS order — the ones
// a global deploy narrowed away. apm leaves their deployed copy and lockfile
// hashes behind (apm-driver.md), so Maestro removes exactly these obsolete
// subtrees after a global deploy to detected tools (ADR-0011, #136).
export function untargetedTools(
  detected: readonly SupportedTool[],
): SupportedTool[] {
  return DEPLOY_TOOLS.map((tool) => tool.apmTarget).filter(
    (target) => !detected.includes(target),
  );
}
