import type {
  DeploySkillError,
  RemoveDeployedSkillError,
  RemovePreflightError,
  UpdatePreviewError,
  UpdateRunError,
} from "@maestro/core";
import { HttpError } from "../api/http";
import { DEPLOY_SKILL } from "../inventory/inventory-copy";
import { CHANGE_LOCATION_STEP } from "../settings/settings-copy";
import { CREATE_RELEASE, UPDATE_TARGET } from "../ui/control-labels";
import type { NoticeCopy } from "../ui/notice";
import { requestShapeNotice } from "../ui/notice-table";
import { REMOVE_SKILL, REREAD_LABEL } from "./deploy-state-copy";
import { UPDATE_AGAIN, UPDATE_INCOMPLETE_SENTENCE } from "./update-target-copy";

// One table over the three unions: a code shared by deploy and remove reads the
// same in both. The path-shape codes live in `inventory/connect-notice.ts`.
type DeployStateCode =
  | DeploySkillError
  | RemoveDeployedSkillError
  | RemovePreflightError
  | UpdatePreviewError
  | UpdateRunError;

export type DeployStateNotice = NoticeCopy;

const RECHECK_TARGET = "Deploy again to re-check the target.";

const DEPLOY_AGAIN = "then deploy again.";

const CREATE_RELEASE_STEP = `Select ${CREATE_RELEASE} on the Harness screen`;

export const FIX_AND_RELEASE = `Fix the skill in the Harness. ${CREATE_RELEASE_STEP}, ${DEPLOY_AGAIN}`;

const deleteLinkedFolder = (again: string) =>
  `Delete the linked skill folder in the target, ${again}`;

// No comma after the path: a reader copying the command would paste it.
const removeLink = (path: string, again: string) =>
  `Run rm ${path} and ${again}`;

const DELETE_LINKED_FOLDER = deleteLinkedFolder(DEPLOY_AGAIN);

const LINK_TARGET_SURVIVES =
  "This removes the link only. The folder it points at remains on disk.";

type Body = { message: string; detail?: string };

const LABELS: Record<DeployStateCode, string> = {
  "unsupported-primitive-type": "Skills only",
  "invalid-name": "Unusable skill name",
  "unknown-skill": "Skill not in the Inventory",
  "inventory-not-configured": "No Harness connected",
  "inventory-unreadable": "Could not read Inventory",
  "repo-not-registered": "Repository not registered",
  "inventory-origin-unavailable": "No GitHub origin",
  "no-published-tag": "Not in any release",
  "local-diverged-from-tag": "Harness copy unreleased",
  "deployed-diverged-from-lock": "Local changes in deployed files",
  "deployed-diverged-pinned-per-skill": "Local changes in deployed files",
  "deployed-unverifiable": "Local edits unverifiable",
  "deployed-unreadable": "Deployed copy unreadable",
  "lockfile-malformed": "Could not read deployment record",
  "deploy-in-progress": "Another change is running",
  "not-at-target-release": "Not in this release",
  "skill-not-in-release": "Not in the latest release",
  "target-pinned-per-skill": "Pinned per skill",
  "manifest-not-recognised": "Unsupported apm.yml",
  "operation-unfinished": "Change not finished",
  "deploy-incomplete": "Deploy incomplete",
  "remove-incomplete": "Removal incomplete",
  "no-supported-tool": "No supported tool",
  "auth-required": "No GitHub access",
  "destination-symlinked": "Linked skill folder",
  "deploy-failed": "Deploy did not finish",
  "not-deployed": "Nothing deployed here",
  "ref-unresolvable": "Cannot identify deployed skill",
  "cost-not-acknowledged": "Nothing removed",
  "remove-in-progress": "Another change is running",
  "remove-failed": "Removal outcome unknown",
  "preflight-failed": "Could not check deployed files",
  "preview-failed": "Preview did not run",
  // "Status out of date" covers both a release and a copy that moved after the
  // preview read them.
  "status-out-of-date": "Status out of date",
  "update-in-progress": "Another change is running",
  "update-incomplete": "Update incomplete",
  "update-failed": "Update outcome unknown",
};

// Kept apart from LABELS because codes shared by deploy and removal state
// their own way through (#684). Keyed by core's unions, so a new code fails typecheck.
const DEPLOY: Record<DeploySkillError, Body> = {
  "unsupported-primitive-type": {
    message:
      "Nothing was installed. Maestro deploys skills only. Select a skill, then deploy again.",
    detail: "Hooks and MCP servers stay in the Harness.",
  },
  "invalid-name": {
    message:
      "Nothing was installed. Rename the skill in the Harness, then deploy again.",
    detail: "A skill name uses lowercase letters, digits and single hyphens.",
  },
  "unknown-skill": {
    message:
      "Nothing was installed. Select Re-read Inventory, then select the skill again.",
  },
  "inventory-not-configured": {
    message: `Nothing was installed. ${CHANGE_LOCATION_STEP}, ${DEPLOY_AGAIN}`,
  },
  "inventory-unreadable": {
    message:
      "Nothing was installed. Select Re-read Inventory, then deploy again.",
  },
  "repo-not-registered": {
    message:
      "Nothing was installed. Select Register repository on the Repositories screen, then deploy again.",
  },
  "inventory-origin-unavailable": {
    message:
      "Nothing was installed. Point the Harness clone's origin at its GitHub repository, then deploy again.",
    detail: "A deploy installs from a GitHub tag, over https or ssh.",
  },
  "no-published-tag": {
    message: `Nothing was installed. ${CREATE_RELEASE_STEP}, ${DEPLOY_AGAIN}`,
    detail: "A deploy installs from a published tag.",
  },
  "local-diverged-from-tag": {
    message: `Nothing was installed. ${CREATE_RELEASE_STEP}, ${DEPLOY_AGAIN}`,
    detail: "A deploy installs the latest release, not the Harness copy.",
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
    message:
      "Nothing was installed. Repair or delete apm.lock.yaml in the target, then deploy again.",
    detail:
      "The file is present but does not parse, so the target's state is unknown.",
  },
  "deploy-in-progress": {
    message:
      "Nothing was installed. Wait for the running deploy on this target to finish, then deploy again.",
  },
  "ref-unresolvable": {
    message:
      "Nothing was installed. Leave one entry for the Harness in apm.lock.yaml, then deploy again.",
    detail: "The target's record names more than one, or names no release.",
  },
  "not-at-target-release": {
    message: `Nothing was installed. Select ${UPDATE_TARGET} on the Deploy-state screen to move this target to a release that holds the skill.`,
    detail: "This skill is not in the release this target follows.",
  },
  "target-pinned-per-skill": {
    message: `Nothing was installed. Select ${REMOVE_SKILL} for each skill on the Deploy-state screen. Then select ${DEPLOY_SKILL} to put them on one release.`,
    detail: "This target holds skills from separate deployments.",
  },
  "manifest-not-recognised": {
    message:
      "Nothing was installed. Leave one dependency on the Harness with a skills list in apm.yml, then deploy again.",
    detail: "Maestro edits that list only, and it found another shape.",
  },
  "operation-unfinished": {
    message:
      "Nothing was installed. Open the target on the Deploy-state screen and finish the earlier change, then deploy again.",
    detail: "An earlier change on this target did not finish.",
  },
  "deploy-incomplete": {
    message:
      "Part of the selection is not on disk. Open the target on the Deploy-state screen and select Retry deploy.",
    detail: "apm reported success, but some files are missing.",
  },
  "no-supported-tool": {
    message:
      "Nothing was installed. Install Claude Code or Codex, then deploy again.",
    detail: "A global deploy installs into Claude Code or Codex.",
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
      "The target may hold a partial install. Check the target on the Deploy-state screen, then deploy again.",
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
    message: `Nothing was removed. Select ${REREAD_LABEL} on the Deploy-state screen to read the list again.`,
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
      "Save the changes. Restore the files from the skill's deployed version in the Harness clone, then select Remove skill again.",
  },
  "cost-not-acknowledged": {
    message: `Nothing was removed. A copy changed after the check. Read the list again, then select ${REMOVE_SKILL}.`,
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
      "An earlier change on this target did not finish. Open the target on the Deploy-state screen and finish that change, then remove the skill again.",
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
  label: "Deploy outcome unknown",
  message: `Nothing confirmed the deploy. ${RECHECK_TARGET}`,
  detail: UNKNOWN_DETAIL,
};

const UNKNOWN_REMOVE: DeployStateNotice = {
  label: "Removal outcome unknown",
  message:
    "Nothing confirmed the removal. Check the target on the Deploy-state screen to see whether the skill is still deployed.",
  detail: UNKNOWN_DETAIL,
};

const UNKNOWN_UPDATE: DeployStateNotice = {
  label: "Preview outcome unknown",
  message: `Nothing was changed. Wait a moment, ${UPDATE_AGAIN}`,
  detail: UNKNOWN_DETAIL,
};

// The target may hold a partial update, so this sends the reader to the card.
const UNKNOWN_UPDATE_RUN: DeployStateNotice = {
  label: "Update outcome unknown",
  message: `Nothing confirmed the update. Check the target on the Deploy-state screen, ${UPDATE_AGAIN}`,
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
    message: `${CHANGE_LOCATION_STEP}, ${UPDATE_AGAIN}`,
  },
  "inventory-unreadable": {
    message: `Select Re-read Inventory on the Harness location screen, ${UPDATE_AGAIN}`,
  },
  "no-published-tag": {
    message: `${CREATE_RELEASE_STEP}, ${UPDATE_AGAIN}`,
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
    message: `The latest release does not hold this skill. ${CREATE_RELEASE_STEP}, ${DEPLOY_AGAIN}`,
    detail: "Nothing was changed, and the target keeps its own release.",
  },
  "destination-symlinked": {
    message: `Nothing was written. ${deleteLinkedFolder(UPDATE_AGAIN)}`,
    detail: LINK_TARGET_SURVIVES,
  },
  "preview-failed": {
    message: `Nothing was changed. Wait a moment, ${UPDATE_AGAIN}`,
  },
};

const UPDATE: Record<UpdateRunError, Body> = {
  ...UPDATE_PREVIEW,
  "status-out-of-date": {
    message: `Nothing was changed. The target changed after the preview. Select ${UPDATE_TARGET} again.`,
  },
  "update-in-progress": {
    message:
      "An update is still running on this target. Wait for it to finish.",
  },
  "operation-unfinished": {
    message:
      "An earlier change on this target did not finish. Open the target on the Deploy-state screen and finish that change, then select Update target again.",
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
  "update-incomplete": {
    message: UPDATE_INCOMPLETE_SENTENCE,
    detail: "apm reported success, but some files are missing.",
  },
  "update-failed": {
    message: `Nothing proved the update finished. Check the target on the Deploy-state screen, ${UPDATE_AGAIN}`,
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
    const { level: _level, ...notice } = requestShape;
    return notice;
  }
  const label = LABELS[error.code as DeployStateCode];
  const body = bodies[error.code];
  return label === undefined || body === undefined
    ? fallback
    : { label, ...body };
}

/** The whole notice for one deploy code, as a bulk run reports it. */
export function deployNoticeFor(
  code: DeploySkillError,
  linkedPath: string | undefined,
): DeployStateNotice {
  const notice = { label: LABELS[code], ...DEPLOY[code] };
  return code === "destination-symlinked" && linkedPath !== undefined
    ? withRm(notice, linkedPath, DEPLOY_AGAIN)
    : notice;
}

/** The whole notice for a refused or failed deploy. */
export function deployNotice(error: unknown): DeployStateNotice {
  return error instanceof HttpError && Object.hasOwn(DEPLOY, error.code ?? "")
    ? deployNoticeFor(error.code as DeploySkillError, linkedPathOf(error))
    : noticeFor(DEPLOY, error, UNKNOWN_DEPLOY);
}

/** The whole notice for a refused Update preview. */
export function updatePreviewNotice(error: unknown): DeployStateNotice {
  return withLinkedPath(
    noticeFor(UPDATE_PREVIEW, error, UNKNOWN_UPDATE),
    error,
    UPDATE_AGAIN,
  );
}

/** The whole notice for a refused or failed Update. */
export function updateNotice(error: unknown): DeployStateNotice {
  return withLinkedPath(
    noticeFor(UPDATE, error, UNKNOWN_UPDATE_RUN),
    error,
    UPDATE_AGAIN,
  );
}

// The path the server read from disk replaces the general instruction.
function withLinkedPath(
  notice: DeployStateNotice,
  error: unknown,
  again: string,
): DeployStateNotice {
  const linkedPath = linkedPathOf(error);
  return error instanceof HttpError &&
    error.code === "destination-symlinked" &&
    linkedPath !== undefined
    ? withRm(notice, linkedPath, again)
    : notice;
}

function linkedPathOf(error: unknown): string | undefined {
  return error instanceof HttpError &&
    typeof error.body === "object" &&
    error.body !== null &&
    "linkedPath" in error.body &&
    typeof error.body.linkedPath === "string"
    ? error.body.linkedPath
    : undefined;
}

function withRm(
  notice: DeployStateNotice,
  linkedPath: string,
  again: string,
): DeployStateNotice {
  return {
    ...notice,
    message: `Nothing was written. ${removeLink(linkedPath, again)}`,
  };
}

/** The whole notice for a refused or failed removal. */
export function removeNotice(error: unknown): DeployStateNotice {
  return noticeFor(REMOVE, error, UNKNOWN_REMOVE);
}
