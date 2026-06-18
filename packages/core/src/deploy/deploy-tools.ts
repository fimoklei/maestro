// Single source of truth for which tools a skill deploy targets. apm installs to
// all of them in one action (`-t <tokens>`) and materializes one copy per tool
// under its own directory; the destination guard must scan exactly those copies.
// Both facts derive from DEPLOY_TOOLS here, so adding a tool updates the install
// flag and the scanned subtrees together — it can never update one and silently
// stop guarding the other (#63).
export type DeployTool = {
  // The token apm expects in its `-t` flag (e.g. "claude").
  apmTarget: string;
  // The directory apm materializes this tool's copy under, relative to the
  // deployed root. codex deploys to the cross-client ".agents" dir, not ".codex"
  // (apm-driver.md, 01.2 spike).
  skillsDirPrefix: string;
};

export const DEPLOY_TOOLS: readonly DeployTool[] = [
  { apmTarget: "claude", skillsDirPrefix: ".claude" },
  { apmTarget: "codex", skillsDirPrefix: ".agents" },
];

// The `-t` flag value for an apm install: every tool's token, comma-joined.
// Repeating the flag (`-t a -t b`) is unsupported by apm (last wins), so a
// single comma list is the contract (apm-driver.md).
export const APM_DEPLOY_TARGET_FLAG = DEPLOY_TOOLS.map(
  (tool) => tool.apmTarget,
).join(",");

// The deployed subtrees a skill of <name> occupies — one per deploy tool, keyed
// relative to the deployed root, matching the lockfile's deployed_file_hashes.
export function deployTargetSubtrees(name: string): string[] {
  return DEPLOY_TOOLS.map((tool) => `${tool.skillsDirPrefix}/skills/${name}`);
}
