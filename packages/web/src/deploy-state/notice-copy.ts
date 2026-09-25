import type {
  DeploySkillError,
  RemoveDeployedSkillError,
  RemovePreflightError,
  UpdatePreviewError,
  UpdateRunError,
} from "@maestro/core";
import { HttpError } from "../api/http";
import type { NoticeLevel } from "../ui/notice";
import { requestShapeNotice } from "../ui/notice-table";

// One table over the three unions: a code shared by deploy and remove reads the
// same in both. The path-shape codes live in `inventory/connect-notice.ts`.
type DeployStateCode =
  | DeploySkillError
  | RemoveDeployedSkillError
  | RemovePreflightError
  | UpdatePreviewError
  | UpdateRunError;

/** A finished notice: heading, sentence and detail, ready to render. */
export type DeployStateNotice = {
  level: NoticeLevel;
  label: string;
  message: string;
  detail?: string;
};

export const FIX_AND_RELEASE =
  "Fix the skill in the Harness, publish a release, then deploy again.";

const RECHECK_TARGET = "Deploy again to re-check the target.";

export const LEFT_ALONE_PINNED = "Left alone — pinned per skill";

export const RETRY_ON_CARD =
  "Select Retry deploy on the target card, then deploy again.";

export const DEPLOY_STILL_RUNNING =
  "A deploy is still running on this target. Wait for it to finish.";

export const UPDATE_TO_REACH_RELEASE =
  "Select Update target to reach this release.";

const DEPLOY_AGAIN = "then deploy again.";

export const DELETE_LINKED_FOLDER = `Delete the linked skill folder in the target, ${DEPLOY_AGAIN}`;

const LINK_TARGET_SURVIVES =
  "This removes the link only. The folder it points at remains on disk.";

// No comma after the path: a reader copying the command would paste it.
export const linkedFolderRecovery = (path: string) =>
  `Run rm ${path} and ${DEPLOY_AGAIN} ${LINK_TARGET_SURVIVES}`;

type Heading = { level: NoticeLevel; label: string };
type Body = { message: string; detail?: string };

// Level rides here because the two refusals the user can force through are
// `warning` on both surfaces.
const HEADINGS: Record<DeployStateCode, Heading> = {
  "unsupported-primitive-type": { level: "error", label: "Skills only" },
  "invalid-name": { level: "error", label: "Unusable skill name" },
  "unknown-skill": { level: "error", label: "Skill not in the Inventory" },
  "inventory-not-configured": { level: "error", label: "No Harness connected" },
  "inventory-unreadable": { level: "error", label: "Could not read Inventory" },
  "repo-not-registered": { level: "error", label: "Repository not registered" },
  "inventory-origin-unavailable": { level: "error", label: "No GitHub origin" },
  "no-published-tag": { level: "error", label: "Not in any release" },
  "local-diverged-from-tag": {
    level: "error",
    label: "Harness copy unreleased",
  },
  "deployed-diverged-from-lock": {
    level: "warning",
    label: "Local changes in deployed files",
  },
  "deployed-diverged-pinned-per-skill": {
    level: "warning",
    label: "Local changes in deployed files",
  },
  "deployed-unverifiable": {
    level: "warning",
    label: "Local edits unverifiable",
  },
  "deployed-unreadable": { level: "error", label: "Deployed copy unreadable" },
  "lockfile-malformed": {
    level: "error",
    label: "Could not read deployment record",
  },
  "deploy-in-progress": { level: "error", label: "Another change is running" },
  "not-at-target-release": { level: "error", label: "Not in this release" },
  "skill-not-in-release": {
    level: "error",
    label: "Not in the latest release",
  },
  "target-pinned-per-skill": { level: "error", label: "Release not adopted" },
  "manifest-not-recognised": {
    level: "error",
    label: "Unsupported apm.yml",
  },
  "operation-unfinished": { level: "error", label: "Change not finished" },
  "deploy-incomplete": { level: "error", label: "Deploy incomplete" },
  "remove-incomplete": { level: "error", label: "Removal incomplete" },
  "no-supported-tool": { level: "error", label: "No supported tool" },
  "auth-required": { level: "error", label: "No GitHub access" },
  "destination-symlinked": { level: "error", label: "Linked skill folder" },
  "deploy-failed": { level: "error", label: "Deploy did not finish" },
  "not-deployed": { level: "error", label: "Nothing deployed here" },
  "ref-unresolvable": {
    level: "error",
    label: "Cannot identify deployed skill",
  },
  "cost-not-acknowledged": { level: "warning", label: "Nothing removed" },
  "remove-in-progress": { level: "error", label: "Another change is running" },
  "remove-failed": { level: "error", label: "Removal outcome unknown" },
  "preflight-failed": {
    level: "error",
    label: "Could not check deployed files",
  },
  "preview-failed": { level: "error", label: "Preview did not run" },
  // "Status out of date" covers both a release and a copy that moved after the
  // preview priced them.
  "status-out-of-date": { level: "error", label: "Status out of date" },
  "update-in-progress": { level: "error", label: "Another change is running" },
  "update-incomplete": { level: "warning", label: "Update incomplete" },
  "update-failed": { level: "error", label: "Update outcome unknown" },
};

const UPDATE_AGAIN = "then select Update target again.";

// Kept apart from HEADINGS because codes shared by deploy and removal state
// their own way through (#684). Keyed by core's unions, so a new code fails typecheck.
const DEPLOY: Record<DeploySkillError, Body> = {
  "unsupported-primitive-type": {
    message:
      "Maestro deploys skills; hooks and MCP servers stay in the Harness. Deploy a skill instead.",
  },
  "invalid-name": {
    message:
      "A skill name uses lowercase letters, digits and single hyphens. Rename it in the Harness, then deploy again.",
  },
  "unknown-skill": {
    message: "Re-read the Inventory, then pick the skill from the list again.",
  },
  "inventory-not-configured": {
    message: "Connect a Harness on the Inventory screen, then deploy again.",
  },
  "inventory-unreadable": {
    message:
      "Select Re-read Inventory on the Harness location screen, then deploy again.",
  },
  "repo-not-registered": {
    message: "Register this repository in Maestro, then deploy again.",
  },
  "inventory-origin-unavailable": {
    message:
      "Point the Harness clone's origin at its GitHub repository, then deploy again.",
    detail: "A deploy installs from a GitHub tag, over https or ssh.",
  },
  "no-published-tag": {
    message: "Publish a release on the Harness screen, then deploy again.",
    detail: "A deploy installs from a published tag.",
  },
  "local-diverged-from-tag": {
    message:
      "A deploy installs the latest release, not the Harness copy. Publish a release, then deploy again.",
  },
  "deployed-diverged-from-lock": {
    message: "Deploy again to replace the local edits with the latest release.",
    detail: "The edits never went through the Harness.",
  },
  "deployed-unverifiable": {
    message: "Deploy again to replace this copy with the latest release.",
    detail:
      "This copy predates content tracking, so any change in it is invisible.",
  },
  "deployed-unreadable": {
    message:
      "Nothing was installed. Make the deployed copy readable, then deploy again.",
    detail: "Its permissions or its shape blocked the check.",
  },
  "lockfile-malformed": {
    message: "Repair or delete apm.lock.yaml in the target, then deploy again.",
    detail:
      "The file is present but does not parse, so the target's state is unknown.",
  },
  "deploy-in-progress": {
    message: DEPLOY_STILL_RUNNING,
  },
  "ref-unresolvable": {
    message:
      "Nothing was installed. Leave one entry for the Harness in apm.lock.yaml, then deploy again.",
    detail: "The target's record names more than one, or names no release.",
  },
  "not-at-target-release": {
    message:
      "This skill is not in the release this target follows. Select Update target to move to the release that holds it.",
  },
  "target-pinned-per-skill": {
    message:
      "This target has skills from separate deployments. Select Remove skill for each skill, then Deploy skill to put them on one release.",
  },
  "manifest-not-recognised": {
    message:
      "Nothing was installed. Leave one dependency on the Harness with a skills list in apm.yml, then deploy again.",
    detail: "Maestro edits that list only, and it found another shape.",
  },
  "operation-unfinished": {
    message:
      "An earlier change on this target did not finish. Check the target card to finish that change, then deploy again.",
  },
  "deploy-incomplete": {
    message:
      "Part of the selection is not on disk. Select Retry deploy to run the same release again.",
    detail: "apm reported success, but some files are missing.",
  },
  "no-supported-tool": {
    message:
      "A global deploy installs into Claude Code or Codex. Install one, then deploy again.",
  },
  "auth-required": {
    message:
      "Nothing was installed. Set up GitHub access in git, then deploy again.",
    detail: "GitHub refused the download.",
  },
  "destination-symlinked": {
    message: `Nothing was written. ${DELETE_LINKED_FOLDER}`,
    detail: LINK_TARGET_SURVIVES,
  },
  "deploy-failed": {
    message:
      "The target may hold a partial install. Check its state below, then deploy again.",
  },
};

const REMOVE: Record<RemoveDeployedSkillError | RemovePreflightError, Body> = {
  "unsupported-primitive-type": {
    message:
      "Maestro removes skills; hooks and MCP servers stay where they are. Remove a skill instead.",
  },
  "invalid-name": {
    message:
      "Nothing was removed. A skill name uses lowercase letters, digits and single hyphens.",
  },
  "repo-not-registered": {
    message: "Register this repository in Maestro, then remove again.",
  },
  "no-supported-tool": {
    message:
      "Neither Claude Code nor Codex is on this machine. There is nothing here to remove.",
  },
  "not-deployed": {
    message: "Nothing was removed. Reload the page to read the list again.",
  },
  "lockfile-malformed": {
    message: "Repair or delete apm.lock.yaml in the target, then remove again.",
    detail:
      "The file is present but does not parse, so nothing can name what to remove.",
  },
  "ref-unresolvable": {
    message:
      "A removal could delete the wrong package. Deploy the skill again to restore a readable entry.",
    detail:
      "Its reference does not point at this skill the way a Maestro deploy would.",
  },
  "deployed-unreadable": {
    message:
      "Nothing can say what a removal would delete. Make the deployed copy readable, then remove again.",
  },
  // Global copies under Other copies have no Deploy again control, hence the detail.
  "deployed-diverged-from-lock": {
    message: "The skill was not removed. Its files changed after deployment.",
    detail:
      "Deploy again to restore the released files. Then remove the skill. Reset any copy under Other copies manually.",
  },
  "deployed-diverged-pinned-per-skill": {
    message: "The skill was not removed. Its files changed after deployment.",
    detail:
      "Save the changes. Restore the files from the pinned release in the Harness clone, then select Remove skill again.",
  },
  "cost-not-acknowledged": {
    message:
      "The copy on disk changed since this removal was priced. Check the new cost above, then remove the skill.",
  },
  "remove-in-progress": {
    message:
      "A removal is still running on this target. Wait for it to finish.",
  },
  "manifest-not-recognised": {
    message:
      "Nothing was removed. Leave one dependency on the Harness with a skills list in apm.yml, then remove the skill again.",
    detail: "Maestro edits that list only, and it found another shape.",
  },
  "operation-unfinished": {
    message:
      "An earlier change on this target did not finish. Check the target card to finish that change, then remove the skill again.",
  },
  "remove-incomplete": {
    message:
      "The skill's files are still on disk. Select Retry removal to run the same removal again.",
    detail: "apm reported success, but some files are missing.",
  },
  "remove-failed": {
    message:
      "The copy may be gone or may still be there. Confirm the removal again to delete whatever is left.",
    detail: "The removal ran but proved nothing.",
  },
  "preflight-failed": {
    message: "Make the deployed copy readable, then start the removal again.",
  },
};

const UNKNOWN_DETAIL =
  "A dropped connection, or a failure this version of Maestro does not name.";

// A failure with no code — a dropped connection, or a code this build predates.
const UNKNOWN_DEPLOY: DeployStateNotice = {
  level: "error",
  label: "Deploy outcome unknown",
  message: `Nothing confirmed the deploy. ${RECHECK_TARGET}`,
  detail: UNKNOWN_DETAIL,
};

const UNKNOWN_REMOVE: DeployStateNotice = {
  level: "error",
  label: "Removal outcome unknown",
  message:
    "Nothing confirmed the removal. Reload the page, then check whether the skill is still deployed.",
  detail: UNKNOWN_DETAIL,
};

const UNKNOWN_UPDATE: DeployStateNotice = {
  level: "error",
  label: "Preview outcome unknown",
  message: `Nothing was changed. Wait a moment, ${UPDATE_AGAIN}`,
  detail: UNKNOWN_DETAIL,
};

// The target may hold a partial update, so this sends the reader to the card.
const UNKNOWN_UPDATE_RUN: DeployStateNotice = {
  level: "error",
  label: "Update outcome unknown",
  message: `Nothing confirmed the update. Check the target card, ${UPDATE_AGAIN}`,
  detail: UNKNOWN_DETAIL,
};

const UPDATE_PREVIEW: Record<UpdatePreviewError, Body> = {
  "repo-not-registered": {
    message: `Register this repository in Maestro, ${UPDATE_AGAIN}`,
  },
  "no-supported-tool": {
    message:
      "Neither Claude Code nor Codex is on this machine. There is nothing here to update.",
  },
  "not-deployed": {
    message:
      "This target follows no release. Select Deploy skill in the Inventory to put one on it.",
  },
  "lockfile-malformed": {
    message: `Repair or delete apm.lock.yaml in the target, ${UPDATE_AGAIN}`,
    detail:
      "The file is present but does not parse, so the target's state is unknown.",
  },
  "deployed-unreadable": {
    message: `Nothing was changed. Make the deployed copy readable, ${UPDATE_AGAIN}`,
    detail: "Its permissions or its shape blocked the check.",
  },
  "inventory-not-configured": {
    message: `Connect a Harness on the Inventory screen, ${UPDATE_AGAIN}`,
  },
  "inventory-unreadable": {
    message: `Select Re-read Inventory on the Harness location screen, ${UPDATE_AGAIN}`,
  },
  "no-published-tag": {
    message: `Publish a release on the Harness screen, ${UPDATE_AGAIN}`,
    detail: "An update moves the target to a published tag.",
  },
  "inventory-origin-unavailable": {
    message: `Point the Harness clone's origin at its GitHub repository, ${UPDATE_AGAIN}`,
    detail: "An update installs from a GitHub tag, over https or ssh.",
  },
  "ref-unresolvable": {
    message: `Nothing was changed. Leave one entry for the Harness in apm.lock.yaml, ${UPDATE_AGAIN}`,
    detail: "The target's record names more than one, or names no release.",
  },
  "skill-not-in-release": {
    message:
      "The latest release does not hold this skill. Publish a release on the Harness screen, then deploy again.",
    detail: "Nothing was changed, and the target keeps its own release.",
  },
  "preview-failed": {
    message: `Nothing was changed. Wait a moment, ${UPDATE_AGAIN}`,
  },
};

const UPDATE: Record<UpdateRunError, Body> = {
  ...UPDATE_PREVIEW,
  "status-out-of-date": {
    message: `The target changed since this update was priced. Nothing was changed, ${UPDATE_AGAIN}`,
  },
  "update-in-progress": {
    message:
      "An update is still running on this target. Wait for it to finish.",
  },
  "operation-unfinished": {
    message:
      "An earlier change on this target did not finish. Check the target card to finish that change, then select Update target again.",
  },
  "deployed-diverged-from-lock": {
    message:
      "Nothing was changed. Select Update target again to review the local edits before updating.",
    detail: "The edits never went through the Harness.",
  },
  "deployed-unverifiable": {
    message:
      "Nothing was changed. Select Update target again to review the unverified copies before updating.",
    detail:
      "These copies predate content tracking, so any change in them is invisible.",
  },
  "manifest-not-recognised": {
    message: `Nothing was changed. Leave one dependency on the Harness with a skills list in apm.yml, ${UPDATE_AGAIN}`,
    detail: "Maestro edits that list only, and it found another shape.",
  },
  "destination-symlinked": {
    message: `Nothing was written. Delete the linked skill folder in the target, ${UPDATE_AGAIN}`,
    detail: LINK_TARGET_SURVIVES,
  },
  "update-incomplete": {
    message:
      "The update is incomplete. Select Retry update to run the same release again.",
    detail: "apm reported success, but some files are missing.",
  },
  "update-failed": {
    message: `Nothing proved the update finished. Check the target card, ${UPDATE_AGAIN}`,
  },
};

// Required return, never `?? error.message`: an uncovered code would otherwise
// render the wrapper's own "Request failed with status 422." on screen.
function noticeFor(
  bodies: Partial<Record<string, Body>>,
  error: unknown,
  fallback: DeployStateNotice,
): DeployStateNotice {
  if (!(error instanceof HttpError) || error.code === undefined) {
    return fallback;
  }
  const requestShape = requestShapeNotice(error);
  if (requestShape) {
    return requestShape;
  }
  const heading = HEADINGS[error.code as DeployStateCode];
  const body = bodies[error.code];
  return heading === undefined || body === undefined
    ? fallback
    : { ...heading, ...body };
}

/** Terse enough to also stand as a bulk report's row label. */
export function deployStateHeading(code: DeployStateCode): string {
  return HEADINGS[code].label;
}

/** The whole notice for a refused or failed deploy. */
export function deployNotice(error: unknown): DeployStateNotice {
  return noticeFor(DEPLOY, error, UNKNOWN_DEPLOY);
}

/** The whole notice for a refused Update preview. */
export function updatePreviewNotice(error: unknown): DeployStateNotice {
  return noticeFor(UPDATE_PREVIEW, error, UNKNOWN_UPDATE);
}

/** The whole notice for a refused or failed Update. */
export function updateNotice(error: unknown): DeployStateNotice {
  return noticeFor(UPDATE, error, UNKNOWN_UPDATE_RUN);
}

/** The whole notice for a refused or failed removal. */
export function removeNotice(error: unknown): DeployStateNotice {
  return noticeFor(REMOVE, error, UNKNOWN_REMOVE);
}
