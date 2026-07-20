// The package barrel carries only what crosses the package boundary — what
// `server`, `web` or the test suites actually import. Anything used solely
// inside `core` stays exported from its own module and off this list, so the
// public surface reads as a contract rather than an index of the package.
export { ApmCliDriver } from "./deploy/apm-cli-driver";
export { resolveApmScratchCwd } from "./deploy/apm-scratch-cwd";
export {
  DeploySkill,
  type DeploySkillError,
  type DeployTarget,
} from "./deploy/deploy-skill";
export { DEPLOY_TOOLS, type SupportedTool } from "./deploy/deploy-tools";
export { DeployedCleanupAdapter } from "./deploy/deployed-cleanup";
export { DeployedContentAdapter } from "./deploy/deployed-content";
export {
  resolveDeployedLockfilePath,
  resolveDeployedRoot,
} from "./deploy/deployed-content-roots";
export { readGitOriginUrl } from "./deploy/git-origin-url";
export { InventoryGitAdapter } from "./deploy/inventory-git";
export {
  DeployStateReader,
  GlobalDeployStateReader,
} from "./deploy-state/deploy-state-reader";
export { resolveApmGlobalRoot } from "./deploy-state/resolve-apm-global-root";
export { CheckVersionDrift } from "./drift/check-version-drift";
export {
  type BrowseCrumb,
  type BrowseEntry,
  type BrowseEntryFacts,
  type BrowseError,
  BrowseFilesystem,
  type BrowseSuccess,
} from "./filesystem/browse-filesystem";
export { coreHealth } from "./health";
export {
  ConnectInventory,
  type ConnectInventoryError,
} from "./inventory/connect-inventory";
export {
  InventoryReader,
  type InventoryResult,
} from "./inventory/inventory-reader";
export { resolveInventoryPath } from "./inventory/resolve-inventory-path";
export { resolveMaestroConfigPath } from "./registry/config-path";
export { ConfigStore } from "./registry/config-store";
export type { FileSystemPort } from "./registry/file-system";
export { NodeFileSystem } from "./registry/node-file-system";
export { Registry } from "./registry/registry";
export type { RepoPathError } from "./registry/repo-path";
export { ToolPresenceAdapter } from "./tools/tool-presence";
export type { ToolPresencePort } from "./tools/tool-presence-port";
