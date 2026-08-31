import type {
  DeploySkillError,
  RemoveDeployedSkillError,
  RemovePreflightError,
  RepoPathError,
} from "@maestro/core";
import type { NoticeHeading } from "../ui/notice-table";

// One table over the four unions: a code shared by deploy and remove is the
// same thing going wrong, so it reads the same in both.
type DeployStateCode =
  | DeploySkillError
  | RemoveDeployedSkillError
  | RemovePreflightError
  | RepoPathError;

// Read by the remove dialog as a literal level, so the warning it renders
// carries its own way through (notice.tsx).
export const RESTATED_COST_HEADING = {
  level: "warning",
  label: "nothing was removed",
} as const satisfies NoticeHeading;

// Not a `NoticeTable`: these rows may carry `warning` for the two refusals the
// user can force through — proceeding costs local edits rather than failing,
// and the cost rides in the action label its call site supplies.
const deployStateNotice: Record<DeployStateCode, NoticeHeading> = {
  "unsupported-primitive-type": {
    level: "error",
    label: "only skills for now",
  },
  "invalid-name": { level: "error", label: "the name is not a slug" },
  "unknown-skill": { level: "error", label: "skill not in the inventory" },
  "inventory-not-configured": {
    level: "error",
    label: "no harness connected",
  },
  "repo-not-registered": { level: "error", label: "repo not registered" },
  "inventory-origin-unavailable": {
    level: "error",
    label: "the harness has no GitHub origin",
  },
  "no-published-tag": { level: "error", label: "no published tag has it" },
  "local-diverged-from-tag": {
    level: "error",
    label: "the harness copy is unpublished",
  },
  "deployed-diverged-from-lock": {
    level: "warning",
    label: "the deployed copy has local edits",
  },
  "deployed-unverifiable": {
    level: "warning",
    label: "local edits cannot be checked",
  },
  "deployed-unreadable": {
    level: "error",
    label: "the deployed copy cannot be read",
  },
  "lockfile-malformed": { level: "error", label: "the lockfile is unreadable" },
  "deploy-in-progress": {
    level: "error",
    label: "a deploy is already running",
  },
  "no-supported-tool": { level: "error", label: "no supported tool detected" },
  "auth-required": { level: "error", label: "GitHub access is missing" },
  "destination-symlinked": {
    level: "error",
    label: "the destination is a symlink",
  },
  "deployed-unsupported-package-type": {
    level: "error",
    label: "unmanageable package type",
  },
  "deploy-recorded-invalid": {
    level: "error",
    label: "the deploy landed no files",
  },
  "deploy-unverified": { level: "error", label: "the deploy is unproven" },
  "deploy-failed": { level: "error", label: "the deploy stopped part-way" },
  "not-deployed": { level: "error", label: "nothing deployed here" },
  "ref-unresolvable": {
    level: "error",
    label: "the lockfile entry is unrecognisable",
  },
  "cost-not-acknowledged": RESTATED_COST_HEADING,
  "remove-in-progress": {
    level: "error",
    label: "a change is already running",
  },
  "remove-failed": { level: "error", label: "the removal failed" },
  "preflight-failed": { level: "error", label: "the check could not run" },
  missing: { level: "error", label: "no path given" },
  relative: { level: "error", label: "the path is not absolute" },
  "not-found": { level: "error", label: "no directory at that path" },
  "not-a-directory": { level: "error", label: "the path is not a directory" },
};

// A failure with no code — a network error, or a code this build predates.
const UNKNOWN_DEPLOY_FAILURE: NoticeHeading = {
  level: "error",
  label: "the deploy did not run",
};

export function deployStateHeading(code: string | undefined): NoticeHeading {
  if (code === undefined) {
    return UNKNOWN_DEPLOY_FAILURE;
  }
  return deployStateNotice[code as DeployStateCode] ?? UNKNOWN_DEPLOY_FAILURE;
}
