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

// One table over the three unions: a code shared by deploy and remove is the
// same thing going wrong, so it reads the same in both. The path-shape codes
// live in `inventory/connect-notice.ts` instead.
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

// One string, two surfaces: the deploy refusal and the bulk report's row both
// send the reader down the same steps.
export const FIX_AND_RELEASE =
  "Fix the skill in the Harness, publish a release, then deploy again.";

export const RECHECK_TARGET = "Deploy again to re-check the target.";

// One string, two surfaces again: the bulk report's row and the single
// refusal's notice send the reader to the same control (ADR-0031, #951).
export const LEFT_ALONE_PINNED = "Left alone — pinned per skill";

export const RETRY_ON_CARD =
  "Select Retry deploy on the target card, then deploy again.";

// One string, two surfaces: the deploy refusal's notice and the bulk report's
// row both tell the reader to wait for the same operation.
export const DEPLOY_STILL_RUNNING =
  "A deploy is still running on this target. Wait for it to finish.";

export const UPDATE_TO_REACH_RELEASE =
  "Select Update target to reach this release.";

// The symlink refusal, in two spellings of one recovery: the exact `rm` when the
// server names the link, the folder-shaped fallback when it cannot (#748). Both
// live here so neither drifts from the other.
const DEPLOY_AGAIN = "then deploy again.";

const LINK_TARGET_SURVIVES =
  "This removes the link only. The folder it points at remains on disk.";

export function linkedFolderNotice(path: string): Body {
  return {
    // No comma after the path: a reader copying the command would paste it.
    message: `Nothing was written. Run rm ${path} and ${DEPLOY_AGAIN}`,
    detail: LINK_TARGET_SURVIVES,
  };
}

type Heading = { level: NoticeLevel; label: string };
type Body = { message: string; detail?: string };

// The heading per code. Level rides here because the two refusals the user can
// force through are `warning` on both surfaces, and the cost of forcing them
// rides in the action label its call site supplies.
const HEADINGS: Record<DeployStateCode, Heading> = {
  "unsupported-primitive-type": { level: "error", label: "Skills only" },
  "invalid-name": { level: "error", label: "Unusable skill name" },
  "unknown-skill": { level: "error", label: "Skill not in the Inventory" },
  "inventory-not-configured": { level: "error", label: "No Harness connected" },
  "inventory-unreadable": { level: "error", label: "Inventory not read" },
  "repo-not-registered": { level: "error", label: "Repository not registered" },
  "inventory-origin-unavailable": { level: "error", label: "No GitHub origin" },
  "no-published-tag": { level: "error", label: "Not in any release" },
  "local-diverged-from-tag": {
    level: "error",
    label: "Harness copy unreleased",
  },
  "deployed-diverged-from-lock": {
    level: "warning",
    label: "Local edits in the deployed copy",
  },
  "deployed-unverifiable": {
    level: "warning",
    label: "Local edits unverifiable",
  },
  "deployed-unreadable": { level: "error", label: "Deployed copy unreadable" },
  "lockfile-malformed": {
    level: "error",
    label: "Deployment record unreadable",
  },
  // One heading for both scopes: a target takes one change at a time, whichever
  // change is running (ADR-0031, #951).
  "deploy-in-progress": { level: "error", label: "Target busy" },
  "not-at-target-release": { level: "error", label: "Not in this release" },
  // One release further than the refusal above: the latest release holds the
  // skill no more than the target's own does, so no move would help (#955).
  "skill-not-in-release": {
    level: "error",
    label: "Not in the latest release",
  },
  "target-pinned-per-skill": { level: "error", label: "Release not adopted" },
  "manifest-not-recognised": {
    level: "error",
    label: "Manifest not recognised",
  },
  "operation-unfinished": { level: "error", label: "Change not finished" },
  "deploy-incomplete": { level: "error", label: "Deploy incomplete" },
  "remove-incomplete": { level: "error", label: "Removal incomplete" },
  "no-supported-tool": { level: "error", label: "No supported tool" },
  "auth-required": { level: "error", label: "No GitHub access" },
  "destination-symlinked": { level: "error", label: "Linked skill folder" },
  "deploy-failed": { level: "error", label: "Deploy stopped part-way" },
  "not-deployed": { level: "error", label: "Nothing deployed here" },
  "ref-unresolvable": {
    level: "error",
    label: "Unrecognisable deployment entry",
  },
  "cost-not-acknowledged": { level: "warning", label: "Nothing removed" },
  "remove-in-progress": { level: "error", label: "Target busy" },
  "remove-failed": { level: "error", label: "Removal unproven" },
  "preflight-failed": { level: "error", label: "Check did not run" },
  "preview-failed": { level: "error", label: "Preview did not run" },
  // The update's own four. "Status out of date" covers both a release and a
  // copy that moved after the preview priced them (spec stories 24, 41).
  "status-out-of-date": { level: "error", label: "Status out of date" },
  "update-in-progress": { level: "error", label: "Target busy" },
  "update-incomplete": { level: "warning", label: "Update incomplete" },
  "update-failed": { level: "error", label: "Update unproven" },
};

// One string, two surfaces: every update refusal sends the reader back to the
// same control.
const UPDATE_AGAIN = "then select Update target again.";

// Sentence and detail per code, kept apart from the headings above because six
// codes refuse both a deploy and a removal, and each states its own way through
// (#684). Keyed by core's unions, so a new code fails typecheck here.
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
    // "Re-read" is the sidebar control's own label, letter for letter (R-D).
    message: "Re-read the Inventory, then pick the skill from the list again.",
  },
  "inventory-not-configured": {
    message: "Connect a Harness on the Inventory screen, then deploy again.",
  },
  "inventory-unreadable": {
    // "Re-read Inventory" is the Harness location screen's own button (R-D).
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
    // The filename stays in the sentence: the instruction acts on the file
    // itself, and "repair the deployment record" is unperformable (`copy.md`).
    message: "Repair or delete apm.lock.yaml in the target, then deploy again.",
    detail:
      "The file is present but does not parse, so the target's state is unknown.",
  },
  "deploy-in-progress": {
    message: DEPLOY_STILL_RUNNING,
  },
  // The same cause as on a removal: the target's own record names no single
  // package, so one wording covers both (#684).
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
      "This target was deployed one skill at a time. Select Remove skill for each skill, then Deploy skill to put them back on one release.",
  },
  "manifest-not-recognised": {
    // The filename stays in the sentence: the instruction acts on the file
    // itself (`copy.md`).
    message:
      "Nothing was installed. Leave one dependency on the Harness with a skills list in apm.yml, then deploy again.",
    detail: "Maestro edits that list only, and it found another shape.",
  },
  "operation-unfinished": {
    message:
      "An earlier change on this target did not finish. Select Retry deploy on the target card, then deploy again.",
  },
  "deploy-incomplete": {
    message:
      "Part of the selection is not on disk. Select Retry deploy to run the same release again.",
    detail: "apm reported success, and the files say otherwise.",
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
    message: `Nothing was written. Delete the linked skill folder in the target, ${DEPLOY_AGAIN}`,
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
  // No way through inside the cockpit, so the notice ends on the cause
  // (`copy.md` — where no action exists, that notice is complete).
  "no-supported-tool": {
    message:
      "Neither Claude Code nor Codex is on this machine. There is nothing here to remove.",
  },
  "not-deployed": {
    message: "Nothing was deleted. Reload the page to read the list again.",
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
  // "Deploy again" is the control's own label (R-D, CONTEXT.md): the one way
  // to reset an edited copy inside the cockpit. Global copies under Other
  // copies have no such control, hence the detail.
  "deployed-diverged-from-lock": {
    message:
      "Nothing was removed. Deploy again to replace the local edits, then remove the skill.",
    detail:
      "apm keeps an edited or added file and stops part-way; a copy nothing deploys to is reset by hand.",
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
      "An earlier change on this target did not finish. Select Retry removal on the target card, then remove the skill again.",
  },
  "remove-incomplete": {
    message:
      "The skill's files are still on disk. Select Retry removal to run the same removal again.",
    detail: "apm reported success, and the files say otherwise.",
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

// A write whose answer never arrived: the target may hold a partial update, so
// this one sends the reader to the card rather than claiming nothing happened.
const UNKNOWN_UPDATE_RUN: DeployStateNotice = {
  level: "error",
  label: "Update outcome unknown",
  message: `Nothing confirmed the update. Check the target card, ${UPDATE_AGAIN}`,
  detail: UNKNOWN_DETAIL,
};

// The update preview's own refusals. Six codes it shares with deploy and remove
// state the update's way through, never the other surface's (#684).
const UPDATE_PREVIEW: Record<UpdatePreviewError, Body> = {
  "repo-not-registered": {
    message: `Register this repository in Maestro, ${UPDATE_AGAIN}`,
  },
  // No way through inside the cockpit, so the notice ends on the cause
  // (`copy.md` — where no action exists, that notice is complete).
  "no-supported-tool": {
    message:
      "Neither Claude Code nor Codex is on this machine. There is nothing here to update.",
  },
  "not-deployed": {
    message:
      "This target follows no release. Select Deploy skill in the Inventory to put one on it.",
  },
  "lockfile-malformed": {
    // The filename stays in the sentence: the instruction acts on the file
    // itself (`copy.md`).
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
    // "Re-read Inventory" is the Harness location screen's own button (R-D).
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
  // The same cause as on a deploy: the target's own record names no single
  // package, and this one states the update's way back to it (#684, #960).
  "ref-unresolvable": {
    message: `Nothing was changed. Leave one entry for the Harness in apm.lock.yaml, ${UPDATE_AGAIN}`,
    detail: "The target's record names more than one, or names no release.",
  },
  // The Inventory's entrance only: the reader asked for a skill, and no release
  // on offer holds it. "Deploy again" names the control they started from (#955).
  "skill-not-in-release": {
    message:
      "The latest release does not hold this skill. Publish a release on the Harness screen, then deploy again.",
    detail: "Nothing was changed, and the target keeps its own release.",
  },
  "preview-failed": {
    message: `Nothing was changed. Wait a moment, ${UPDATE_AGAIN}`,
  },
};

// The confirm's own refusals: the preview's, plus the ones only a write has.
// Each states the update's way through, never another surface's (#684, #954).
const UPDATE: Record<UpdateRunError, Body> = {
  ...UPDATE_PREVIEW,
  // One code, two causes — a release published since, and a copy edited since.
  // Neither is guessed at: the sentence states what the server observed.
  "status-out-of-date": {
    message: `The target changed since this update was priced. Nothing was changed, ${UPDATE_AGAIN}`,
  },
  "update-in-progress": {
    message:
      "An update is still running on this target. Wait for it to finish.",
  },
  "operation-unfinished": {
    message:
      "An earlier change on this target did not finish. Select Retry deploy on the target card, then select Update target again.",
  },
  "deployed-diverged-from-lock": {
    message: `Nothing was changed. Select Update target again to read the copies in the way.`,
    detail: "The edits never went through the Harness.",
  },
  "deployed-unverifiable": {
    message: `Nothing was changed. Select Update target again to read the copies in the way.`,
    detail:
      "These copies predate content tracking, so any change in them is invisible.",
  },
  "manifest-not-recognised": {
    // The filename stays in the sentence: the instruction acts on the file
    // itself (`copy.md`).
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
    detail: "apm reported success, and the files say otherwise.",
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

/**
 * The heading for one deploy or remove code — terse enough to also stand as a
 * row label, so a code reads the same in a notice and in a bulk report.
 */
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
