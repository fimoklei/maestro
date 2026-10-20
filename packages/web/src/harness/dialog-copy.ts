import type {
  HarnessPrimitiveType,
  ManifestAdvisory,
  StructuralProblem,
} from "@maestro/core";
import { RESTORE_LABEL } from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import { type Copy, type Phrase, phrase } from "../ui/phrase";
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

export const DELETE_UNAVAILABLE = {
  checking: "checking your clone",
  failed: "clone not read",
  "no-harness": "no Harness connected",
  "not-in-clone": "not in your clone",
} as const;

export const DELETION_CHECKING = "Checking for uncommitted changes…";

/** The facts that name an item and what holds it on disk: a skill is a folder, a prompt one file. */
export const ITEM_FACTS: Record<
  HarnessPrimitiveType,
  { name: string; path: string }
> = {
  skill: { name: "Skill", path: "Folder" },
  prompt: { name: "Prompt", path: "File" },
};

export const RESTORE_BODY: Record<HarnessPrimitiveType, Phrase> = {
  skill: phrase`${RESTORE_LABEL.skill} brings back the folder from your last local commit. Later changes do not come back.`,
  prompt: phrase`${RESTORE_LABEL.prompt} brings back the file from your last local commit. Later changes do not come back.`,
};

// A prompt deploys to no target, so it has no deployed copies to mention.
export const discardBody = (
  type: HarnessPrimitiveType,
  branch: ReturnType<typeof defaultBranchCopy>,
): Phrase =>
  type === "skill"
    ? phrase`This replaces the skill folder in your clone with its copy on ${branch}. You cannot recover your changes. Deployed copies remain unchanged.`
    : phrase`This replaces the prompt file in your clone with its copy on ${branch}. You cannot recover your changes.`;
