import type {
  HarnessChange,
  HarnessPrimitiveType,
  ManifestAdvisory,
  StructuralProblem,
} from "@maestro/core";
import {
  CREATE_RELEASE,
  DISCARD_CHANGE,
  rereadLabel,
  WITHDRAW_FROM_RELEASE,
  WITHDRAW_PROPOSAL,
} from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import {
  type Copy,
  machine,
  named,
  namedList,
  type Phrase,
  phrase,
} from "../ui/phrase";
import { ITEM_WORDS } from "./item-words";
import type { defaultBranchCopy } from "./stage-copy";

// Reported, never blocking: the skill still ships or imports (#519).
export const skillChecksNotice = (
  step: "import" | "update" | "publish",
  items: readonly Copy[],
): NoticeContent => ({
  level: "warning",
  label: "Skill checks found issues",
  message:
    step === "publish"
      ? "You can still publish the release."
      : `You can still ${step} the skill.`,
  items,
});

// Reported, never blocking: the release ships what is merged.
export const inFlightNotice = (
  names: readonly string[],
): NoticeContent | null =>
  names.length === 0
    ? null
    : {
        level: "warning",
        label: "Release uses older versions",
        message: phrase`These skills and prompts have newer changes that are not merged: ${namedList(names)}.`,
      };

export const ROOT_SKILL_FILE = "SKILL.md at the Harness root";
const ROOT_SKILL_FILE_CAUSE =
  "Every target would get the whole Harness as one skill.";

/** The release plan's block on a root SKILL.md, before anything is published. */
export const rootSkillFileNotice = (defaultBranch: string): NoticeContent => ({
  level: "error",
  label: ROOT_SKILL_FILE,
  message: phrase`Remove SKILL.md from the root of ${machine(defaultBranch)} on GitHub. Select ${rereadLabel("Harness")}, then select ${CREATE_RELEASE} again.`,
  detail: ROOT_SKILL_FILE_CAUSE,
});

// Follows the skill's name in the release's checks notice.
export const FINDING_TEXT: Record<StructuralProblem, string> = {
  "missing-manifest": "has no SKILL.md.",
  "invalid-frontmatter": "has frontmatter Maestro cannot read.",
  "empty-description": "has an empty description.",
};

export const ADVISORY_TEXT: Record<ManifestAdvisory, string> = {
  "long-manifest": "SKILL.md is over 500 lines.",
  "long-description": "The description is over 1,024 characters.",
};

// Import skill's Folder path, submitted empty.
export const FOLDER_MISSING = "Enter the skill folder's absolute path.";

export const DELETION_CHECKING = "Checking for uncommitted changes…";

export const restoreTitle = (name: string) => `Restore ${name}`;

export const restoreBody = (type: HarnessPrimitiveType): Phrase =>
  phrase`${ITEM_WORDS[type].restoreLabel} brings back the ${ITEM_WORDS[type].holder} from your last local commit. Later changes do not come back.`;

export const RESTORE_KEEPS_PROPOSAL = "Your proposal remains unchanged.";

export const RESTORED_FROM_FACT = "Restored from";

export const RESTORED_FROM_HINT =
  "Your last local commit. If it moves before you confirm, nothing is restored.";

// An item no target holds has no deployed copies to mention.
const replacesInClone = (
  type: HarnessPrimitiveType,
  branch: ReturnType<typeof defaultBranchCopy>,
): Phrase => {
  const w = ITEM_WORDS[type];
  return phrase`This replaces the ${w.noun} ${w.holder} in your clone with its copy on ${branch}. You cannot recover your changes.`;
};

const withDeployedCopies = (type: HarnessPrimitiveType, body: Phrase) =>
  ITEM_WORDS[type].deploys
    ? phrase`${body} Deployed copies remain unchanged.`
    : body;

export const discardBody = (
  type: HarnessPrimitiveType,
  branch: ReturnType<typeof defaultBranchCopy>,
): Phrase => withDeployedCopies(type, replacesInClone(type, branch));

export const discardTitle = (name: string) => `${DISCARD_CHANGE} for ${name}`;

export const discardHint = (
  branch: ReturnType<typeof defaultBranchCopy>,
): Phrase =>
  phrase`If ${branch} moves before you confirm, nothing is discarded.`;

export const withdrawTitle = (name: string) =>
  `${WITHDRAW_PROPOSAL} for ${name}`;

export const PULL_REQUEST_FACT = "Pull request";

// In the order the withdrawal runs: the clone, then the request, then the branch.
// With no open request there is nothing to close (#1639).
export const withdrawBody = (
  type: HarnessPrimitiveType,
  branch: ReturnType<typeof defaultBranchCopy>,
  closesRequest: boolean,
): Phrase =>
  withDeployedCopies(
    type,
    closesRequest
      ? phrase`${replacesInClone(type, branch)} It closes the pull request and deletes the proposal branch.`
      : phrase`${replacesInClone(type, branch)} It deletes the proposal branch.`,
  );

export const WITHDRAW_CHECKING = "Checking for changes not yet proposed…";

const KEEP_OUTSIDE_CLONE = "To keep them, copy them outside your clone first.";

/** The files a withdrawal would lose; null where none would be. */
export const unproposedNotice = (
  files: readonly string[],
): NoticeContent | null =>
  files.length === 0
    ? null
    : {
        level: "warning",
        label: "Changes not yet proposed",
        message: `${WITHDRAW_PROPOSAL} discards the changes in these files. ${KEEP_OUTSIDE_CLONE}`,
        items: files.map((file) => phrase`${machine(file)}`),
      };

export const releaseWithdrawalTitle = (name: string) =>
  `Withdraw ${name} from release`;

// The Change decides what the clone gets back: the latest release's copy
// under every name the change touched.
export const releaseWithdrawalBody = (
  type: HarnessPrimitiveType,
  change: HarnessChange,
  previousName: string | null,
): Phrase => {
  const w = ITEM_WORDS[type];
  const changed: Record<HarnessChange, Phrase> = {
    addition: phrase`This removes the ${w.noun} ${w.holder} from your clone.`,
    edit: phrase`This replaces the ${w.noun} ${w.holder} in your clone with its copy in the latest release.`,
    deletion: phrase`This brings back the ${w.noun} ${w.holder} from the latest release.`,
    rename: phrase`This brings back ${named(previousName ?? "")} from the latest release and removes the new name.`,
  };
  return withDeployedCopies(
    type,
    phrase`${changed[change]} The ${w.noun} then waits under Pending proposal.`,
  );
};

/** The files a withdrawal from release would replace; null where none would be. */
export const releaseWithdrawalFilesNotice = (
  files: readonly string[],
): NoticeContent | null =>
  files.length === 0
    ? null
    : {
        level: "warning",
        label: "Changes not yet proposed",
        message: `${WITHDRAW_FROM_RELEASE} discards the changes in these files. ${KEEP_OUTSIDE_CLONE}`,
        items: files.map((file) => phrase`${machine(file)}`),
      };

export const UNPROPOSED_UNKNOWN_NOTICE: NoticeContent = {
  level: "warning",
  label: "Changes not checked",
  message: `${WITHDRAW_PROPOSAL} discards any change you made after proposing. ${KEEP_OUTSIDE_CLONE}`,
  detail: "Maestro could not compare your clone with the proposal branch.",
};
