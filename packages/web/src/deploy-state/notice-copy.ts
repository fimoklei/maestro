import type {
  DeploySkillError,
  RemoveDeployedSkillError,
  RemovePreflightError,
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
  | RemovePreflightError;

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

export const ADD_SKILL_MD =
  "Add a SKILL.md in the Harness, publish a release, then deploy again.";

export const RECHECK_TARGET = "Deploy again to re-check the target.";

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
  "deploy-in-progress": { level: "error", label: "Deploy already running" },
  "no-supported-tool": { level: "error", label: "No supported tool" },
  "auth-required": { level: "error", label: "No GitHub access" },
  "destination-symlinked": { level: "error", label: "Linked skill folder" },
  "deployed-unsupported-package-type": {
    level: "error",
    label: "Unsupported package type",
  },
  "deploy-recorded-invalid": { level: "error", label: "No files deployed" },
  "deploy-unverified": { level: "error", label: "Deploy unproven" },
  "deploy-failed": { level: "error", label: "Deploy stopped part-way" },
  "not-deployed": { level: "error", label: "Nothing deployed here" },
  "ref-unresolvable": {
    level: "error",
    label: "Unrecognisable deployment entry",
  },
  "cost-not-acknowledged": { level: "warning", label: "Nothing removed" },
  "remove-in-progress": { level: "error", label: "Change already running" },
  "remove-failed": { level: "error", label: "Removal unproven" },
  "preflight-failed": { level: "error", label: "Check did not run" },
};

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
    message:
      "This target takes one change at a time. Wait for the running deploy to finish.",
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
  "deployed-unsupported-package-type": {
    message: `Its files are still there. ${FIX_AND_RELEASE}`,
  },
  "deploy-recorded-invalid": {
    message: ADD_SKILL_MD,
  },
  "deploy-unverified": {
    message: `The target's deployment record does not show it. ${RECHECK_TARGET}`,
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
      "This target takes one change at a time. Wait for the running change to finish.",
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

/** The whole notice for a refused or failed removal. */
export function removeNotice(error: unknown): DeployStateNotice {
  return noticeFor(REMOVE, error, UNKNOWN_REMOVE);
}
