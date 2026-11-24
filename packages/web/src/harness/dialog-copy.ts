import type {
  HarnessChange,
  HarnessPrimitiveType,
  StructuralProblem,
} from "@maestro/core";
import { NEXT_RELEASE } from "../ui/band-copy";
import {
  CREATE_RELEASE,
  DISCARD_CHANGE,
  rereadLabel,
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
        message: phrase`These skills and prompts have newer changes that aren't merged: ${namedList(names)}.`,
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
  "invalid-frontmatter": "has frontmatter Maestro can't read.",
  "empty-description": "has an empty description.",
};

export const DELETION_CHECKING = "Checking for uncommitted changes…";

export const restoreTitle = (name: string) => `Restore ${name}`;

export const restoreBody = (type: HarnessPrimitiveType): Phrase =>
  phrase`${ITEM_WORDS[type].restoreLabel} brings back the ${ITEM_WORDS[type].holder} from your last local commit. Later changes don't come back.`;

export const RESTORE_KEEPS_PROPOSAL = "Your proposal remains unchanged.";

export const RESTORED_FROM_FACT = "Restored from";

export const RESTORED_FROM_HINT =
  "If your clone's last commit moves before you confirm, nothing is restored.";

// An item no target holds has no deployed copies to mention.
const replacesInClone = (type: HarnessPrimitiveType): Phrase => {
  const w = ITEM_WORDS[type];
  return phrase`This replaces the ${w.noun} ${w.holder} in your clone with its copy in ${NEXT_RELEASE}. You can't recover your changes.`;
};

const withDeployedCopies = (type: HarnessPrimitiveType, body: Phrase) =>
  ITEM_WORDS[type].deploys
    ? phrase`${body} Deployed copies remain unchanged.`
    : body;

export const discardBody = (type: HarnessPrimitiveType): Phrase =>
  withDeployedCopies(type, replacesInClone(type));

export const discardTitle = (name: string) => `${DISCARD_CHANGE} for ${name}`;

export const DISCARD_HINT = `If ${NEXT_RELEASE} changes before you confirm, nothing is discarded.`;

export const withdrawTitle = (name: string) =>
  `${WITHDRAW_PROPOSAL} for ${name}`;

export const PULL_REQUEST_FACT = "Pull request";

// In the order the withdrawal runs: the clone, then the request, then the branch.
// With no open request there is nothing to close (#1639).
export const withdrawBody = (
  type: HarnessPrimitiveType,
  closesRequest: boolean,
): Phrase =>
  withDeployedCopies(
    type,
    closesRequest
      ? phrase`${replacesInClone(type)} It closes the pull request and deletes the proposal branch.`
      : phrase`${replacesInClone(type)} It deletes the proposal branch.`,
  );

// The list is built from the operator's own categories, never the clone, so
// nothing in the clone changes.
export const listWithdrawBody = (number: number | null): string =>
  number === null
    ? "This deletes the proposal branch on GitHub. Your categories stay as they are."
    : `This closes pull request #${number} and deletes the proposal branch on GitHub. Your categories stay as they are.`;

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

// The commit on GitHub changes; the author's copy in the clone does not.
export const releaseWithdrawalBody = (
  type: HarnessPrimitiveType,
  name: string,
  change: HarnessChange,
  previousName: string | null,
): { changes: Phrase; stays: Phrase } => {
  const w = ITEM_WORDS[type];
  const out = phrase`This takes ${named(name)} out of the next release on GitHub.`;
  return {
    changes:
      change === "rename" && previousName !== null
        ? phrase`${out} ${named(previousName)} returns to the next release.`
        : out,
    stays: withDeployedCopies(
      type,
      phrase`Your copy in the clone stays as it is. The ${w.noun} then waits under Pending proposal.`,
    ),
  };
};

// Every pull request replaces the whole file, so no withdrawal is partial.
// The review read knows only the newest merged number, hence "including".
export const listReleaseWithdrawalBody = (
  change: HarnessChange,
  mergedRequest: number | null,
): { changes: string; stays: null } => {
  const including =
    mergedRequest === null ? "" : `, including pull request #${mergedRequest}`;
  const out = `This takes every categories change merged since the latest release out of the next release on GitHub${including}.`;
  return {
    // Only a hand edit deletes the file: a pull request always writes one.
    changes:
      change === "deletion"
        ? "This takes the deletion of the categories file out of the next release on GitHub."
        : change === "addition"
          ? `${out} The latest release has no categories, so the next release then has none either.`
          : out,
    stays: null,
  };
};

export const RELEASE_WITHDRAWAL_CHECKING = "Checking what GitHub holds…";

export const UNPROPOSED_UNKNOWN_NOTICE: NoticeContent = {
  level: "warning",
  label: "Changes not checked",
  message: `${WITHDRAW_PROPOSAL} discards any change you made after proposing. ${KEEP_OUTSIDE_CLONE}`,
  detail: "Maestro couldn't compare your clone with the proposal branch.",
};

export const NO_CHANGE_SINCE_RELEASE =
  "No change has merged since the latest release.";

export const EMPTY_RELEASE_PLAN = {
  released: `${NO_CHANGE_SINCE_RELEASE} A proposed change can be released once its pull request is merged on GitHub.`,
  unreleased:
    "The next release doesn't contain skills or prompts yet. A skill or prompt can be released once its pull request is merged on GitHub.",
} as const;
