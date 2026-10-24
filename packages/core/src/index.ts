// Only what crosses the package boundary; keep core-internal exports off it.

export {
  composeUseCases,
  type UseCasePorts,
  type UseCases,
} from "./compose-use-cases";
export { ApmCliDriver } from "./deploy/apm-cli-driver";
export { SelectionWriter } from "./deploy/apply-selection";
export {
  // Exported for the integration lane's apm fake.
  type ApmDriverPort,
  type BulkDeployReport,
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
export { InFlightLocks } from "./deploy/in-flight-locks";
export { InventoryGitAdapter } from "./deploy/inventory-git";
export { LocalCopyGuard } from "./deploy/local-copy-guard";
export { isValidSkillSlug } from "./deploy/package-ref";
export { RecordedPackageAdapter } from "./deploy/recorded-package";
export type {
  ReclaimConsent,
  ReclaimPreview,
} from "./deploy/remove-consent";
export {
  type BulkRemoveReport,
  type BulkRemoveTarget,
  type RemoveCheck,
  RemoveDeployedSkill,
  type RemoveDeployedSkillError,
  type RemoveOutcome,
  type RemovePreflightError,
  type RemoveTargetState,
  type RemoveToolCheck,
  type RemoveToolOutcome,
  type RemoveWarning,
} from "./deploy/remove-deployed-skill";
export {
  type PendingOperation,
  RetryTargetOperation,
  type RetryTargetOperationError,
} from "./deploy/retry-target-operation";
export { TargetOperationStore } from "./deploy/target-operation";
export {
  type CopyConsentRow,
  type UpdateOutcomeRow,
  type UpdatePreview,
  type UpdatePreviewError,
  type UpdateRunError,
  type UpdateSkillRow,
  type UpdateSkillState,
  UpdateTarget,
} from "./deploy/update-target";
export {
  type DeployStateExtras,
  DeployStateReader,
  GlobalDeployStateReader,
} from "./deploy-state/deploy-state-reader";
export type {
  DeployedPrimitive,
  PinnedPerSkill,
  ReleaseHead,
  SkippedEntry,
} from "./deploy-state/deploy-state-types";
export type { ToolDeployState } from "./deploy-state/group-primitives-by-tool";
export { ReleaseHeadReader } from "./deploy-state/release-head";
export { CheckVersionDrift } from "./drift/check-version-drift";
export type { VersionDrift } from "./drift/parse-outdated";
export {
  ReadDrift,
  type ReadDriftEntry,
} from "./drift/read-drift";
export {
  CopySkillFolder,
  type CopySkillFolderResult,
} from "./filesystem/copy-skill-folder";
export { NodeCopyTreeFs } from "./filesystem/copy-tree-fs";
export {
  ChooseFolder,
  type ChooseFolderError,
} from "./folder-chooser/choose-folder";
export type {
  FolderChooserPort,
  HelperOutcome,
  RunHelper,
} from "./folder-chooser/folder-chooser-port";
export { MacosFolderChooser } from "./folder-chooser/macos-folder-chooser";
export { platformFolderChooser } from "./folder-chooser/platform-folder-chooser";
export { runHelper } from "./folder-chooser/run-helper";
export { WindowsFolderChooser } from "./folder-chooser/windows-folder-chooser";
export { readConfiguredGitOriginUrl } from "./git/configured-origin";
export {
  type GitHubPage,
  OWNER_REPO_PATTERN,
  readGitHubPage,
  UNKNOWN_PAGE,
} from "./git/github-page";
export {
  DeleteLocal,
  type DeleteLocalError,
  type DeletionCheckResult,
  type PrimitiveDeletionCheck,
} from "./harness/delete-local";
export {
  DiscardChange,
  type DiscardChangeError,
} from "./harness/discard-change";
export { GhCliAdapter } from "./harness/gh-cli-adapter";
export { HarnessFetchGate } from "./harness/harness-fetch-gate";
export { HarnessFreshnessStore } from "./harness/harness-freshness-store";
export { HarnessGitAdapter } from "./harness/harness-git";
export type { HarnessMovementKind } from "./harness/harness-movements";
export {
  HARNESS_PRIMITIVE_TYPES,
  type HarnessPrimitiveType,
  type PrimitiveRef,
} from "./harness/harness-primitive";
export type {
  HarnessReviewPort,
  HarnessReviewRead,
  NewReviewRequest,
  RequestedReviewer,
  ReviewRequest,
  ReviewWriteOutcome,
  ViewerRead,
} from "./harness/harness-review-port";
export type {
  HarnessChange,
  HarnessStage,
  HarnessStageRead,
  HarnessStageRow,
  ReviewRequestLink,
  StageStatus,
} from "./harness/harness-stages";
export {
  ImportLocalEdits,
  type ImportLocalEditsInput,
  type LocalEditsError,
  type LocalEditsRefusal,
  type LocalEditsSkill,
} from "./harness/import-local-edits";
export type { ImportMode } from "./harness/import-mode";
export {
  ImportPrompt,
  type ImportPromptCheck,
  type ImportPromptError,
  type ImportPromptSuccess,
} from "./harness/import-prompt";
export {
  type ImportCheck,
  type ImportNameBlocker,
  ImportSkill,
  type ImportSkillError,
  type ImportSourceBlocker,
} from "./harness/import-skill";
export {
  Promote,
  type PromoteError,
} from "./harness/promote";
export {
  PromoteDeletion,
  type PromoteDeletionError,
} from "./harness/promote-deletion";
export {
  type ProposalActionError,
  type ProposalActionResult,
  ProposalActions,
} from "./harness/proposal-actions";
export type { SemverStep } from "./harness/propose-release-version";
export {
  PublishRelease,
  type PublishReleaseError,
} from "./harness/publish-release";
export {
  type CloneSync,
  type HarnessFreshness,
  type HarnessState,
  type HarnessStateError,
  type HarnessStateResult,
  ReadHarnessState,
  type ReleasePlan,
  type ReleasePlanError,
} from "./harness/read-harness-state";
export type { PendingMovement } from "./harness/release-delta";
export { RELEASE_TAG_PATTERN } from "./harness/release-tag";
export {
  type HarnessSkillTree,
  ReleasedContentReader,
} from "./harness/released-content";
export {
  Restore,
  type RestoreError,
} from "./harness/restore";
export type { ManifestAdvisory } from "./harness/skill-manifest";
export type { StructuralProblem } from "./harness/validate-skill-structure";
export {
  resolveApmGlobalRoot,
  resolveApmScratchCwd,
  resolveMaestroConfigPath,
} from "./home-directory";
export { GitCloneAdapter } from "./inventory/clone-repository";
export {
  ConnectInventory,
  type ConnectInventoryError,
  type ConnectOutcome,
} from "./inventory/connect-inventory";
export { resolveDefaultBranch } from "./inventory/default-branch";
export { GitHarnessScaffoldAdapter } from "./inventory/harness-scaffold-git";
export { probeHead } from "./inventory/head-commit";
export {
  type InventoryPrimitive,
  type InventoryPrompt,
  InventoryReader,
  type InventoryResult,
  type InventorySkill,
} from "./inventory/inventory-reader";
export type { PendingRelease } from "./inventory/pending-release";
export {
  type ReleasedSkill,
  releasedPrimitivesFromGit,
} from "./inventory/released-primitives";
export { isRepositoryRoot } from "./inventory/repository-root";
export { resolveInventoryPath } from "./inventory/resolve-inventory-path";
export {
  ScaffoldHarness,
  type ScaffoldHarnessError,
} from "./inventory/scaffold-harness";
export { ScaffoldOffers } from "./inventory/scaffold-offers";
export { nodeUseCasePorts } from "./node-use-case-ports";
export { ConfigStore } from "./registry/config-store";
export type { FileSystemPort } from "./registry/file-system";
export { NodeFileSystem } from "./registry/node-file-system";
export {
  type RegisterError,
  Registry,
  type RepoStatus,
} from "./registry/registry";
export type { RepoPathError } from "./registry/repo-path";
export { ToolPresenceAdapter } from "./tools/tool-presence";
