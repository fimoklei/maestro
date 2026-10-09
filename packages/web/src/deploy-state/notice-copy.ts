import type {
  DeploySkillError,
  PendingOperation,
  RemoveDeployedSkillError,
  RemovePreflightError,
  RetryTargetOperationError,
  UpdatePreviewError,
  UpdateRunError,
} from "@maestro/core";
import { HttpError } from "../api/http";
import { LOCAL_CHANGES_NEXT_STEP } from "../inventory/inventory-copy";
import { CHANGE_LOCATION_STEP } from "../settings/settings-copy";
import {
  CREATE_RELEASE,
  DEPLOY_SKILL,
  REMOVE_SKILL,
  rereadLabel,
  UPDATE_TARGET,
} from "../ui/control-labels";
import type { NoticeCopy } from "../ui/notice";
import { requestShapeNotice } from "../ui/notice-table";
import { machine, phrase } from "../ui/phrase";
import { REGISTER_STEP } from "./deploy-state-copy";
import { REASON, type ReasonCode, TARGET_BUSY } from "./reason-copy";
import {
  RETRY_DEPLOY,
  RETRY_LABELS,
  RETRY_REMOVAL,
  unfinishedOperationNotice,
} from "./release-head-copy";
import {
  UPDATE_AGAIN,
  UPDATE_INCOMPLETE_SENTENCE,
  updateAgain,
} from "./update-target-copy";

export type DeployStateNotice = NoticeCopy;

const RECHECK_TARGET = "Deploy again to re-check the target.";

const DEPLOY_AGAIN = "then deploy again.";

const CREATE_RELEASE_STEP = `Select ${CREATE_RELEASE} on the Harness screen`;

export const FIX_AND_RELEASE = `Fix the skill in the Harness. ${CREATE_RELEASE_STEP}, ${DEPLOY_AGAIN}`;

const deleteLinkedFolder = (again: string) =>
  `Delete the linked skill folder in the target, ${again}`;

// No comma after the path: a reader copying the command would paste it.
const removeLink = (path: string, again: string) =>
  phrase`Run ${machine(`rm ${path}`)} and ${again}`;

const DELETE_LINKED_FOLDER = deleteLinkedFolder(DEPLOY_AGAIN);

const EDITS_OUTSIDE_HARNESS = "The edits never went through the Harness.";

const COPIES_PREDATE_TRACKING =
  "These copies predate content tracking, so any change in them is invisible.";

const MANIFEST_OTHER_SHAPE =
  "Maestro edits that list only, and it found another shape.";

const FILES_MISSING = "apm reported success, but some files are missing.";

const LINK_TARGET_SURVIVES =
  "This removes the link only. The folder it points at remains on disk.";

type Body = { message: string; detail?: string };

// Kept apart from REASON because codes shared by deploy and removal state
// their own way through (#684). Keyed by core's unions, so a new code fails typecheck.
const DEPLOY: Record<DeploySkillError, Body> = {
  "unsupported-primitive-type": {
    message:
      "Nothing was deployed. Maestro deploys skills only. Select a skill, then deploy again.",
    detail: "Hooks and MCP servers stay in the Harness.",
  },
  "invalid-name": {
    message:
      "Nothing was deployed. Rename the skill in the Harness, then deploy again.",
    detail: "A skill name uses lowercase letters, digits and single hyphens.",
  },
  "unknown-skill": {
    message: `Nothing was deployed. Select ${rereadLabel("Inventory")}, then select the skill again.`,
  },
  "inventory-not-configured": {
    message: `Nothing was deployed. ${CHANGE_LOCATION_STEP}, ${DEPLOY_AGAIN}`,
  },
  "inventory-unreadable": {
    message: `Nothing was deployed. Select ${rereadLabel("Inventory")}, then deploy again.`,
  },
  "repo-not-registered": {
    message: `Nothing was deployed. ${REGISTER_STEP}, then deploy again.`,
  },
  "inventory-origin-unavailable": {
    message:
      "Nothing was deployed. Point the Harness clone's origin at its GitHub repository, then deploy again.",
    detail: "A deploy takes the skill from a GitHub tag, over https or ssh.",
  },
  "no-published-tag": {
    message: `Nothing was deployed. ${CREATE_RELEASE_STEP}, ${DEPLOY_AGAIN}`,
    detail: "A deploy takes the skill from a published tag.",
  },
  "local-diverged-from-tag": {
    message: `Nothing was deployed. ${CREATE_RELEASE_STEP}, ${DEPLOY_AGAIN}`,
    detail: "A deploy takes the latest release, not the Harness copy.",
  },
  "deployed-diverged-from-lock": {
    message: "Deploy again to replace the local edits with the latest release.",
    detail: EDITS_OUTSIDE_HARNESS,
  },
  "deployed-unverifiable": {
    message: "Deploy again to replace this copy with the latest release.",
    detail:
      "This copy predates content tracking, so any change in it is invisible.",
  },
  "deployed-unreadable": {
    message:
      "Nothing was deployed. Make the deployed copy readable, then deploy again.",
    detail: "Its permissions or its shape blocked the check.",
  },
  "lockfile-malformed": {
    message:
      "Nothing was deployed. Repair or delete apm.lock.yaml in the target, then deploy again.",
    detail:
      "The file is present but does not parse, so the target's state is unknown.",
  },
  "deploy-in-progress": {
    message:
      "Nothing was deployed. Wait for the running deploy on this target to finish, then deploy again.",
  },
  "ref-unresolvable": {
    message:
      "Nothing was deployed. Leave one entry for the Harness in apm.lock.yaml, then deploy again.",
    detail: "The target's record names more than one, or names no release.",
  },
  "not-at-target-release": {
    message: `Nothing was deployed. Select ${UPDATE_TARGET} on the Deploy-state screen to move this target to a release that holds the skill.`,
    detail: "This skill is not in the release this target follows.",
  },
  "target-pinned-per-skill": {
    message: `Nothing was deployed. Select ${REMOVE_SKILL} for each skill on the Deploy-state screen. Then select ${DEPLOY_SKILL} to put them on one release.`,
    detail: "This target holds skills from separate deployments.",
  },
  "manifest-not-recognised": {
    message:
      "Nothing was deployed. Leave one dependency on the Harness with a skills list in apm.yml, then deploy again.",
    detail: MANIFEST_OTHER_SHAPE,
  },
  "operation-unfinished": {
    message:
      "Nothing was deployed. Open the target on the Deploy-state screen and finish the earlier change, then deploy again.",
    detail: "An earlier change on this target did not finish.",
  },
  "deploy-incomplete": {
    message: `Part of the selection is not on disk. Open the target on the Deploy-state screen and select ${RETRY_DEPLOY}.`,
    detail: FILES_MISSING,
  },
  "no-supported-tool": {
    message:
      "Nothing was deployed. Install Claude Code or Codex, then deploy again.",
    detail: "A global deploy puts skills into Claude Code or Codex.",
  },
  "auth-required": {
    message:
      "Nothing was deployed. Set up GitHub access in git, then deploy again.",
    detail: "GitHub refused the download.",
  },
  "destination-symlinked": {
    message: `Nothing was written. ${DELETE_LINKED_FOLDER}`,
    detail: LINK_TARGET_SURVIVES,
  },
  "deploy-failed": {
    message:
      "The target may hold a partial deploy. Check the target on the Deploy-state screen, then deploy again.",
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
    message: `${REGISTER_STEP}, then remove again.`,
  },
  "no-supported-tool": {
    message:
      "Neither Claude Code nor Codex is on this machine. There is nothing here to remove.",
  },
  "not-deployed": {
    message: `Nothing was removed. Select ${rereadLabel("Deploy-state")} on the Deploy-state screen to read the list again.`,
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
  // Global copies under Other copies have no control that restores them, hence the detail.
  "deployed-diverged-from-lock": {
    message: "The skill was not removed. Its files changed after deployment.",
    detail: `${LOCAL_CHANGES_NEXT_STEP} Reset any copy under Other copies manually.`,
  },
  "deployed-diverged-pinned-per-skill": {
    message: "The skill was not removed. Its files changed after deployment.",
    detail: `Save the changes. Restore the files from the skill's deployed version in the Harness clone, then select ${REMOVE_SKILL} again.`,
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
    detail: MANIFEST_OTHER_SHAPE,
  },
  "operation-unfinished": {
    message:
      "An earlier change on this target did not finish. Open the target on the Deploy-state screen and finish that change, then remove the skill again.",
  },
  "remove-incomplete": {
    message: `The skill's files are still on disk. Select ${RETRY_REMOVAL} to run the same removal again.`,
    detail: FILES_MISSING,
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
    message: `${REGISTER_STEP}, ${UPDATE_AGAIN}`,
  },
  "no-supported-tool": {
    message:
      "Neither Claude Code nor Codex is on this machine. There is nothing here to update.",
  },
  "not-deployed": {
    message: `This target follows no release. Select ${DEPLOY_SKILL} in the Inventory to put one on it.`,
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
    message: `Select ${rereadLabel("Inventory")} on the Harness location screen, ${UPDATE_AGAIN}`,
  },
  "no-published-tag": {
    message: `${CREATE_RELEASE_STEP}, ${UPDATE_AGAIN}`,
    detail: "An update moves the target to a published tag.",
  },
  "inventory-origin-unavailable": {
    message: `Point the Harness clone's origin at its GitHub repository, ${UPDATE_AGAIN}`,
    detail: "An update takes the skill from a GitHub tag, over https or ssh.",
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
    message: `An earlier change on this target did not finish. Open the target on the Deploy-state screen and finish that change, then select ${UPDATE_TARGET} again.`,
  },
  "deployed-diverged-from-lock": {
    message: `Nothing was changed. Select ${UPDATE_TARGET} again to review the local edits before updating.`,
    detail: EDITS_OUTSIDE_HARNESS,
  },
  "deployed-unverifiable": {
    message: `Nothing was changed. Select ${UPDATE_TARGET} again to review the unverified copies before updating.`,
    detail: COPIES_PREDATE_TRACKING,
  },
  "manifest-not-recognised": {
    message: `Nothing was changed. Leave one dependency on the Harness with a skills list in apm.yml, ${UPDATE_AGAIN}`,
    detail: MANIFEST_OTHER_SHAPE,
  },
  "update-incomplete": {
    message: UPDATE_INCOMPLETE_SENTENCE,
    detail: FILES_MISSING,
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
  // The server's code as sent: one this build cannot name reads undefined
  // and takes the fallback below.
  const label = REASON[error.code as ReasonCode];
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
  const notice = { label: REASON[code], ...DEPLOY[code] };
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

/** The whole notice for a refused Update preview, naming the control by `label`. */
export function updatePreviewNotice(
  error: unknown,
  label: string,
): DeployStateNotice {
  return withLinkedPath(
    namingUpdate(noticeFor(UPDATE_PREVIEW, error, UNKNOWN_UPDATE), label),
    error,
    updateAgain(label),
  );
}

/** The whole notice for a refused or failed Update, naming the control by `label`. */
export function updateNotice(error: unknown, label: string): DeployStateNotice {
  return withLinkedPath(
    namingUpdate(noticeFor(UPDATE, error, UNKNOWN_UPDATE_RUN), label),
    error,
    updateAgain(label),
  );
}

// The tables name Update target; a row whose update moves more names its own
// label instead, so the notice points at the control the reader sees.
function namingUpdate(
  notice: DeployStateNotice,
  label: string,
): DeployStateNotice {
  const { message } = notice;
  return label === UPDATE_TARGET || typeof message !== "string"
    ? notice
    : {
        ...notice,
        message: message
          .replace(UPDATE_AGAIN, updateAgain(label))
          .replace(`Select ${UPDATE_TARGET} again.`, `Select ${label} again.`),
      };
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
    message: phrase`Nothing was written. ${removeLink(linkedPath, again)}`,
  };
}

/** The whole notice for a refused or failed removal. */
export function removeNotice(error: unknown): DeployStateNotice {
  return noticeFor(REMOVE, error, UNKNOWN_REMOVE);
}

type RetriedOperation = Pick<PendingOperation, "kind" | "release">;

const RETRY_NOUNS: Record<
  PendingOperation["kind"],
  { name: string; noun: string }
> = {
  deploy: { name: "Deploy", noun: "deploy" },
  remove: { name: "Removal", noun: "removal" },
  update: { name: "Update", noun: "update" },
};

function retryCopy(
  operation: RetriedOperation,
): Record<RetryTargetOperationError, DeployStateNotice> {
  const retry = RETRY_LABELS[operation.kind];
  const { name, noun } = RETRY_NOUNS[operation.kind];
  const again = `then select ${retry} again.`;
  return {
    "repo-not-registered": {
      label: REASON["repo-not-registered"],
      message: `Nothing was changed. ${REGISTER_STEP}, ${again}`,
    },
    "nothing-to-retry": {
      label: "Change already finished",
      message:
        "Nothing was changed. The earlier change on this target already finished.",
    },
    "retry-in-progress": {
      label: TARGET_BUSY,
      message: `Nothing was changed. Wait for the running change to finish, ${again}`,
    },
    "deployed-diverged-from-lock": {
      label: REASON["deployed-diverged-from-lock"],
      message: `Nothing was changed. Undo the local edits in the deployed files, ${again}`,
      detail: EDITS_OUTSIDE_HARNESS,
    },
    "deployed-unverifiable": {
      label: REASON["deployed-unverifiable"],
      message: `Nothing was changed. Delete the unverified copies in the target, ${again}`,
      detail: COPIES_PREDATE_TRACKING,
    },
    "deployed-unreadable": {
      label: REASON["deployed-unreadable"],
      message: `Nothing was changed. Make the deployed copy readable, ${again}`,
      detail: "Its permissions or its shape blocked the check.",
    },
    "lockfile-malformed": {
      label: REASON["lockfile-malformed"],
      message: `Nothing was changed. Repair or delete apm.lock.yaml in the target, ${again}`,
      detail:
        "The file is present but does not parse, so the target's state is unknown.",
    },
    "manifest-not-recognised": {
      label: REASON["manifest-not-recognised"],
      message: `Nothing was changed. Leave one dependency on the Harness with a skills list in apm.yml, ${again}`,
      detail: MANIFEST_OTHER_SHAPE,
    },
    "retry-incomplete": {
      label: `${name} still incomplete`,
      message: unfinishedOperationNotice(operation).message,
      detail: FILES_MISSING,
    },
    "retry-failed": {
      label: `${name} outcome unknown`,
      message: `Nothing proved the ${noun} finished. Select ${retry} to run it again.`,
    },
  };
}

/** The whole notice for a failed retry of an unfinished operation. */
export function retryNotice(
  error: unknown,
  operation: RetriedOperation,
): DeployStateNotice {
  const copy = retryCopy(operation);
  if (error instanceof HttpError) {
    const requestShape = requestShapeNotice(error);
    if (requestShape) {
      const { level: _level, ...notice } = requestShape;
      return notice;
    }
    if (Object.hasOwn(copy, error.code ?? "")) {
      return copy[error.code as RetryTargetOperationError];
    }
  }
  return { ...copy["retry-failed"], detail: UNKNOWN_DETAIL };
}
