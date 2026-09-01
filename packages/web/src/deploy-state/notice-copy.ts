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

// The sentence per code, kept apart from the headings above because six codes
// refuse both a deploy and a removal, and each states its own way through
// (#684). Keyed by core's unions, so a new code fails typecheck here.
const deploySentences: Record<DeploySkillError, string> = {
  "unsupported-primitive-type":
    "Hooks and MCP servers stay in the harness until Maestro can deploy them. Deploy a skill instead.",
  "invalid-name":
    "Lowercase letters, digits and hyphens only. Rename the skill in the harness, then deploy again.",
  "unknown-skill":
    "The inventory holds no skill by this name. Refresh the inventory, or pick the skill from the list again.",
  "inventory-not-configured":
    "Nothing can be deployed until Maestro knows where the harness lives. Set the Harness source path, then deploy again.",
  "repo-not-registered":
    "Only a repo registered with Maestro can receive a deploy. Register it, then deploy again.",
  "inventory-origin-unavailable":
    "A deploy installs from GitHub tags, so the inventory clone needs a GitHub origin over https or ssh. Point the clone at the harness repository on GitHub, then deploy again.",
  "no-published-tag":
    "A deploy installs from a published tag, and no tag holds this skill. Publish a release from the Harness view, then deploy again.",
  "local-diverged-from-tag":
    "A deploy would install the published version, not what sits in the harness now. Publish a release from the Harness view, then deploy again.",
  "deployed-diverged-from-lock":
    "Those edits never went through the harness. Reinstalling replaces the copy with the latest published tag.",
  "deployed-unverifiable":
    "This copy predates content tracking, so anything changed in it is invisible. Reinstalling replaces it with the latest published tag.",
  "deployed-unreadable":
    "Its permissions or its shape blocked the check, so nothing was installed. Make it a readable directory, then deploy again.",
  "lockfile-malformed":
    "apm.lock.yaml is present but unparsable, so the target's state is unknown. Repair or delete it, then deploy again.",
  "deploy-in-progress":
    "This target takes one change at a time. The deploy can start once the running one finishes.",
  "no-supported-tool":
    "A global deploy installs into Claude Code or Codex, and neither is on this machine. Install one, then deploy again.",
  "auth-required":
    "GitHub refused the download, so nothing was installed. Restore the machine's GitHub access, then deploy again.",
  "destination-symlinked":
    "apm refuses to install into a linked skill directory, so nothing was written. Replace that link with a real directory, or move the link one level up so the whole skills directory is the link, then deploy again.",
  "deployed-unsupported-package-type":
    "apm recorded a package type Maestro cannot manage as a skill, and left its files in place. Correct the package shape in the harness, publish a new release, then deploy again.",
  "deploy-recorded-invalid":
    "apm reported success but recorded the package as invalid, so no files arrived. A skill needs a SKILL.md — fix it in the harness, publish a new release, then deploy again.",
  "deploy-unverified":
    "apm reported the install as done, but the target's lockfile does not show it, so it does not count as deployed. Deploy again to have Maestro re-check the target.",
  "deploy-failed":
    "apm stopped part-way, so the target may hold a partial install. Read the target's deploy-state below, then deploy again.",
};

const removeSentences: Record<
  RemoveDeployedSkillError | RemovePreflightError,
  string
> = {
  "unsupported-primitive-type":
    "Hooks and MCP servers stay where they are until Maestro can remove them. Remove a skill instead.",
  "invalid-name":
    "Lowercase letters, digits and hyphens only. Nothing was removed, because no deployed skill can carry this name.",
  "repo-not-registered":
    "Only a repo registered with Maestro can be changed. Register it, then remove again.",
  "no-supported-tool":
    "A global removal deletes from Claude Code or Codex, and neither is on this machine. There is nothing here to remove.",
  "not-deployed":
    "This target holds no copy of the skill, so nothing was deleted. The list may be out of date — reload the page to read it again.",
  "lockfile-malformed":
    "apm.lock.yaml is present but unparsable, so Maestro cannot name what to remove. Repair or delete it, then remove again.",
  "ref-unresolvable":
    "Its reference does not point at this skill the way a Maestro deploy would, so a removal could delete the wrong package. Deploy the skill again to restore a reference Maestro can follow.",
  "deployed-unreadable":
    "Its permissions or its shape blocked the check, so Maestro cannot say what a removal would delete. Make it a readable directory, then remove again.",
  "cost-not-acknowledged":
    "The copy on disk is no longer the one this removal was priced against, so nothing was deleted. The list beside this states what a removal would cost now — confirm it to go ahead.",
  "remove-in-progress":
    "This target takes one change at a time. The removal can start once the running one finishes.",
  "remove-failed":
    "apm ran but proved nothing, so the copy may be gone or may still be there. Confirm the removal again to delete whatever is left.",
  "preflight-failed":
    "Nothing can say yet what a removal would delete. Make the deployed copy readable, then open the removal again.",
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
  const heading = deployStateNotice[code as DeployStateCode];
  if (heading === undefined) {
    return UNKNOWN_DEPLOY_FAILURE;
  }
  const message = deploySentences[code as DeploySkillError];
  return message === undefined ? heading : { ...heading, message };
}

// The removal's own sentence, or undefined for a code it does not refuse
// with — a network failure, or one this build predates.
export function removeMessage(code: string | undefined): string | undefined {
  return code === undefined
    ? undefined
    : removeSentences[code as RemoveDeployedSkillError | RemovePreflightError];
}
