import type {
  HarnessPrimitiveType,
  ManifestAdvisory,
  StructuralProblem,
} from "@maestro/core";
import type { NoticeContent } from "../ui/notice";
import { type Copy, type Phrase, phrase } from "../ui/phrase";
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

export const restoreBody = (type: HarnessPrimitiveType): Phrase =>
  phrase`${ITEM_WORDS[type].restoreLabel} brings back the ${ITEM_WORDS[type].holder} from your last local commit. Later changes do not come back.`;

// An item no target holds has no deployed copies to mention.
export const discardBody = (
  type: HarnessPrimitiveType,
  branch: ReturnType<typeof defaultBranchCopy>,
): Phrase => {
  const w = ITEM_WORDS[type];
  const replaces = phrase`This replaces the ${w.noun} ${w.holder} in your clone with its copy on ${branch}. You cannot recover your changes.`;
  return w.deploys
    ? phrase`${replaces} Deployed copies remain unchanged.`
    : replaces;
};
