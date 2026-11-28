import type {
  DeploySkillError,
  LinkedDestination,
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

export const LINKED_REASON: Record<LinkedDestination["kind"], string> = {
  "tool-folder": "Linked tool folder",
  "skill-folder": "Linked skill folder",
};

/** The one reason per server code: Deploy-state's notices, the bulk Remove dialog and its Report. */
export const REASON: Record<ReasonCode, string> = {
  "unsupported-primitive-type": "Skills only",
  "invalid-name": "Unusable skill name",
  "unknown-skill": "Skill not in the Inventory",
  "inventory-not-configured": "No Harness connected",
  "inventory-unreadable": "Couldn't read the Inventory",
  "repo-not-registered": "Repository not registered",
  "inventory-origin-unavailable": "No GitHub origin",
  "no-published-tag": "Not in any release",
  "local-diverged-from-tag": "Harness copy unreleased",
  "target-behind-release": "Target behind",
  "deployed-diverged-from-lock": "Local changes in deployed files",
  "deployed-diverged-pinned-per-skill": "Local changes in deployed files",
  "deployed-unverifiable": "Local edits unverifiable",
  "deployed-unreadable": "Couldn't read the deployed copy",
  "lockfile-malformed": "Couldn't read the deployment record",
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
  "destination-symlinked": "Linked folder",
  "tag-check-timed-out": "Release check timed out",
  "deploy-timed-out": "Deploy timed out",
  "deploy-failed": "Deploy didn't finish",
  "deploy-not-started": "Deploy didn't start",
  "not-deployed": "Nothing deployed here",
  "ref-unresolvable": "Deployed version unknown",
  "cost-not-acknowledged": "Removal not confirmed",
  "remove-in-progress": TARGET_BUSY,
  "remove-timed-out": "Removal timed out",
  "remove-timed-out-unrecorded": "Removal timed out",
  "remove-failed": "Removal outcome unknown",
  "preflight-failed": "Deployed files not checked",
  "preview-failed": "Preview didn't run",
  // "Status out of date" covers both a release and a copy that moved after the
  // preview read them.
  "status-out-of-date": "Status out of date",
  "update-in-progress": TARGET_BUSY,
  "update-incomplete": "Update incomplete",
  "update-timed-out": "Update timed out",
  "update-failed": "Update outcome unknown",
};
