import type {
  DeploySkillError,
  RemoveDeployedSkillError,
  RemovePreflightError,
  UpdatePreviewError,
  UpdateRunError,
} from "@maestro/core";

export type ReasonCode =
  | DeploySkillError
  | RemoveDeployedSkillError
  | RemovePreflightError
  | UpdatePreviewError
  | UpdateRunError;

export const TARGET_BUSY = "Target busy";

/** The one reason per server code: Deploy-state's notices, the bulk Remove dialog and its Report. */
export const REASON: Record<ReasonCode, string> = {
  "unsupported-primitive-type": "Skills only",
  "invalid-name": "Unusable skill name",
  "unknown-skill": "Skill not in the Inventory",
  "inventory-not-configured": "No Harness connected",
  "inventory-unreadable": "Inventory not read",
  "repo-not-registered": "Repository not registered",
  "inventory-origin-unavailable": "No GitHub origin",
  "no-published-tag": "Not in any release",
  "local-diverged-from-tag": "Harness copy unreleased",
  "deployed-diverged-from-lock": "Local changes in deployed files",
  "deployed-diverged-pinned-per-skill": "Local changes in deployed files",
  "deployed-unverifiable": "Local edits unverifiable",
  "deployed-unreadable": "Deployed copy not read",
  "lockfile-malformed": "Deployment record not read",
  "deploy-in-progress": TARGET_BUSY,
  "not-at-target-release": "Not in this release",
  "skill-not-in-release": "Not in the latest release",
  "target-pinned-per-skill": "Pinned per skill",
  "manifest-not-recognised": "Manifest not recognised",
  "operation-unfinished": "Unfinished operation",
  "deploy-incomplete": "Deploy incomplete",
  "remove-incomplete": "Removal incomplete",
  "no-supported-tool": "No supported tool",
  "auth-required": "No GitHub access",
  "destination-symlinked": "Linked skill folder",
  "deploy-failed": "Deploy did not finish",
  "not-deployed": "Nothing deployed here",
  "ref-unresolvable": "Deployed version unknown",
  "cost-not-acknowledged": "Removal not confirmed",
  "remove-in-progress": TARGET_BUSY,
  "remove-failed": "Removal outcome unknown",
  "preflight-failed": "Deployed files not checked",
  "preview-failed": "Preview did not run",
  // "Status out of date" covers both a release and a copy that moved after the
  // preview read them.
  "status-out-of-date": "Status out of date",
  "update-in-progress": TARGET_BUSY,
  "update-incomplete": "Update incomplete",
  "update-failed": "Update outcome unknown",
};
