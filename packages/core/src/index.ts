// Only what crosses the package boundary. Anything used solely inside `core`
// stays off this list, so the surface reads as a contract, not an index.
export { ApmCliDriver } from "./deploy/apm-cli-driver";
export { resolveApmScratchCwd } from "./deploy/apm-scratch-cwd";
export {
  type BulkDeployReport,
  BulkDeploySkills,
} from "./deploy/bulk-deploy-skills";
export {
  type DeployedContentState,
  DeploySkill,
  type DeploySkillError,
  type DeployTarget,
} from "./deploy/deploy-skill";
export { DEPLOY_TOOLS, type SupportedTool } from "./deploy/deploy-tools";
export { DeployedCleanupAdapter } from "./deploy/deployed-cleanup";
export { DeployedContentAdapter } from "./deploy/deployed-content";
export { DeployedLocation } from "./deploy/deployed-location";
export { DeployedRefAdapter } from "./deploy/deployed-ref";
export { readGitOriginUrl } from "./deploy/git-origin-url";
export { InFlightLocks } from "./deploy/in-flight-locks";
export { InventoryGitAdapter } from "./deploy/inventory-git";
export type {
  ReclaimConsent,
  ReclaimPreview,
} from "./deploy/reclaim-consent";
export {
  RemoveDeployedSkill,
  type RemoveDeployedSkillError,
  type RemovePreflightError,
  type RemoveWarning,
} from "./deploy/remove-deployed-skill";
export {
  DeployStateReader,
  GlobalDeployStateReader,
} from "./deploy-state/deploy-state-reader";
export { resolveApmGlobalRoot } from "./deploy-state/resolve-apm-global-root";
export { CheckVersionDrift } from "./drift/check-version-drift";
export type { VersionDrift } from "./drift/parse-outdated";
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
