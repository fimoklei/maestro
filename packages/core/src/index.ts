// Only what crosses the package boundary; keep core-internal exports off it.
export { ApmCliDriver } from "./deploy/apm-cli-driver";
export { resolveApmScratchCwd } from "./deploy/apm-scratch-cwd";
export { SelectionWriter } from "./deploy/apply-selection";
export {
  type BulkDeployReport,
  BulkDeploySkills,
} from "./deploy/bulk-deploy-skills";
export {
  BulkRemoveDeployedSkill,
  type BulkRemoveReport,
  type BulkRemoveTarget,
} from "./deploy/bulk-remove-deployed-skill";
export {
  // Exported for the integration lane's apm fake.
  type ApmDriverPort,
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
export { parseGitOrigin } from "./deploy/git-origin";
export {
  readConfiguredGitOriginUrl,
  readGitOriginUrl,
} from "./deploy/git-origin-url";
export { InFlightLocks } from "./deploy/in-flight-locks";
export { InventoryGitAdapter } from "./deploy/inventory-git";
export {
  type CopyFinding,
  type CopyVerdict,
  type LocalCopyCheck,
  type LocalCopyDecision,
  LocalCopyGuard,
  type LocalCopyScope,
  type LocalCopyWrite,
} from "./deploy/local-copy-guard";
export { isValidSkillSlug } from "./deploy/package-ref";
export { RecordedPackageAdapter } from "./deploy/recorded-package";
export type {
  ReclaimConsent,
  ReclaimPreview,
} from "./deploy/remove-consent";
export {
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
  type UpdateScope,
  type UpdateSkillRow,
  type UpdateSkillState,
  UpdateTarget,
} from "./deploy/update-target";
export {
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
export { resolveApmGlobalRoot } from "./deploy-state/resolve-apm-global-root";
export { CheckVersionDrift } from "./drift/check-version-drift";
export type { VersionDrift } from "./drift/parse-outdated";
export {
  type DriftReading,
  ReadDrift,
  type ReadDriftEntry,
} from "./drift/read-drift";
export {
  CopySkillFolder,
  type CopySkillFolderError,
  type CopySkillFolderInput,
  type CopySkillFolderResult,
} from "./filesystem/copy-skill-folder";
export {
  type CopyEntryFacts,
  type CopyEntryKind,
  type CopyTreeFsPort,
  NodeCopyTreeFs,
} from "./filesystem/copy-tree-fs";
export {
  ChooseFolder,
  type ChooseFolderError,
  type ChooseFolderResult,
} from "./folder-chooser/choose-folder";
export type {
  FolderChooserPort,
  HelperOutcome,
  RunHelper,
} from "./folder-chooser/folder-chooser-port";
export { MacosFolderChooser } from "./folder-chooser/macos-folder-chooser";
export { runHelper } from "./folder-chooser/run-helper";
export {
  DeleteLocalSkill,
  type DeleteLocalSkillError,
  type DeleteLocalSkillResult,
} from "./harness/delete-local-skill";
export { GhCliAdapter, REVIEW_READ_LIMIT } from "./harness/gh-cli-adapter";
export { HarnessFreshnessStore } from "./harness/harness-freshness-store";
export { HarnessGitAdapter } from "./harness/harness-git";
export type {
  HarnessReviewPort,
  HarnessReviewRead,
  NewReviewRequest,
  RequestedReviewer,
  ReviewDecision,
  ReviewRequest,
  ReviewRequestState,
  ReviewWriteOutcome,
} from "./harness/harness-review-port";
export type {
  HarnessStage,
  HarnessStageRead,
  HarnessStageRow,
  HarnessStages,
  ProposalComparison,
  ReleaseStatus,
  ReviewRequestLink,
  ReviewStatus,
  StageStatus,
} from "./harness/harness-stages";
export {
  type ImportCheck,
  type ImportCheckResult,
  type ImportMode,
  type ImportNameBlocker,
  ImportSkill,
  type ImportSkillError,
  type ImportSkillResult,
  type ImportSourceBlocker,
} from "./harness/import-skill";
export {
  type PromoteDeletionError,
  type PromoteDeletionResult,
  PromoteSkillDeletion,
} from "./harness/promote-deletion";
export {
  PromoteSkill,
  type PromoteSkillError,
  type PromoteSkillResult,
} from "./harness/promote-skill";
export {
  type ProposalActionError,
  type ProposalActionResult,
  ProposalActions,
} from "./harness/proposal-actions";
export type { SemverStep } from "./harness/propose-release-version";
export {
  PublishRelease,
  type PublishReleaseError,
  type PublishReleaseResult,
} from "./harness/publish-release";
export {
  type CloneSync,
  type HarnessFreshness,
  type HarnessReleaseState,
  type HarnessState,
  type HarnessStateError,
  type HarnessStateResult,
  type PendingSkillMovement,
  type PromoteSkillOutcome,
  type PublishTagOutcome,
  ReadHarnessState,
  type ReleasePlan,
  type ReleasePlanError,
  type ReleasePlanResult,
  type WorktreeAmbiguity,
} from "./harness/read-harness-state";
export { RELEASE_TAG_PATTERN } from "./harness/release-tag";
export {
  RestoreSkill,
  type RestoreSkillError,
  type RestoreSkillResult,
} from "./harness/restore-skill";
export type { ManifestAdvisory } from "./harness/skill-manifest";
export type {
  SkillMovement,
  SkillMovementKind,
} from "./harness/skill-movements";
export type {
  StructuralFinding,
  StructuralProblem,
} from "./harness/validate-skill-structure";
export {
  type CloneRepositoryPort,
  GitCloneAdapter,
} from "./inventory/clone-repository";
export {
  ConnectInventory,
  type ConnectInventoryError,
  type ConnectOutcome,
} from "./inventory/connect-inventory";
export { resolveDefaultBranch } from "./inventory/default-branch";
export {
  GitHarnessScaffoldAdapter,
  type HarnessScaffoldGitPort,
} from "./inventory/harness-scaffold-git";
export type { HeadProbe } from "./inventory/head-commit";
export { probeHead } from "./inventory/head-commit";
export {
  InventoryReader,
  type InventoryResult,
} from "./inventory/inventory-reader";
export {
  type ReadReleasedSkills,
  type ReleasedSkill,
  releasedSkillsFromGit,
} from "./inventory/released-skills";
export { isRepositoryRoot } from "./inventory/repository-root";
export { resolveInventoryPath } from "./inventory/resolve-inventory-path";
export {
  ScaffoldHarness,
  type ScaffoldHarnessError,
} from "./inventory/scaffold-harness";
export { ScaffoldOffers } from "./inventory/scaffold-offers";
export { resolveMaestroConfigPath } from "./registry/config-path";
export { ConfigStore } from "./registry/config-store";
export type { FileSystemPort } from "./registry/file-system";
export { NodeFileSystem } from "./registry/node-file-system";
export {
  type RegisterError,
  Registry,
  type RepoStatus,
} from "./registry/registry";
export type { RepoPathError } from "./registry/repo-path";
export { bindConfig } from "./server/bind-config";
export { ToolPresenceAdapter } from "./tools/tool-presence";
export type { ToolPresencePort } from "./tools/tool-presence-port";
