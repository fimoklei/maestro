import type {
  DeploySkillError,
  RemoveDeployedSkillError,
  RemovePreflightError,
} from "@maestro/core";
import { HttpError } from "../api/http";
import type { NoticeLevel } from "../ui/notice";

// One table over the three unions: a code shared by deploy and remove is the
// same thing going wrong, so it reads the same in both. The path-shape codes
// are not among them — only connect and scaffold answer with those, and their
// rows live in `inventory/connect-notice.ts`.
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

// One string, two surfaces: the deploy refusal and the skipped-entry line both
// send the reader down the same three steps.
export const FIX_AND_RELEASE =
  "Fix the skill in the Harness, publish a release, then deploy again.";

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
    message:
      "Nothing was written. Replace the link with a real folder, then deploy again.",
    detail:
      "Moving the link up, so the whole skills folder is the link, also works.",
  },
  "deployed-unsupported-package-type": {
    message: `Its files are still there. ${FIX_AND_RELEASE}`,
  },
  "deploy-recorded-invalid": {
    message:
      "A skill needs a SKILL.md. Add one in the Harness, publish a release, then deploy again.",
  },
  "deploy-unverified": {
    message:
      "The target's deployment record does not show it. Deploy again to re-check the target.",
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
  message: "Nothing confirmed the deploy. Deploy again to re-check the target.",
  detail: UNKNOWN_DETAIL,
};

const UNKNOWN_REMOVE: DeployStateNotice = {
  level: "error",
  label: "Removal outcome unknown",
  message:
    "Nothing confirmed the removal. Reload the page, then check whether the skill is still deployed.",
  detail: UNKNOWN_DETAIL,
};

// The one exception to "no sentence crosses the wire" (ADR-0025 §8): the eight
// request-shape messages are authored in `server` and say which field is wrong.
const REQUEST_SHAPE_LABEL = "Request not accepted";

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
  if (error.code === "invalid-body") {
    return {
      level: "error",
      label: REQUEST_SHAPE_LABEL,
      message: error.message,
    };
  }
  const heading = HEADINGS[error.code as DeployStateCode];
  const body = bodies[error.code];
  return heading === undefined || body === undefined
    ? fallback
    : { ...heading, ...body };
}

/** The whole notice for a refused or failed deploy. */
export function deployNotice(error: unknown): DeployStateNotice {
  return noticeFor(DEPLOY, error, UNKNOWN_DEPLOY);
}

/** The whole notice for a refused or failed removal. */
export function removeNotice(error: unknown): DeployStateNotice {
  return noticeFor(REMOVE, error, UNKNOWN_REMOVE);
}
