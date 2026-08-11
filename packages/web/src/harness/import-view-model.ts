// One sentence per import refusal and per convention finding, and the one rule
// that decides whether Import can be pressed. Pure, so the dialog only renders
// what this decides (#576).
import type {
  ImportCheck,
  ImportNameBlocker,
  ImportSourceBlocker,
  ManifestAdvisory,
} from "./use-harness";

// Beside the picked folder: what is wrong with the folder itself.
const SOURCE_BLOCKER_TEXT: Record<ImportSourceBlocker, string> = {
  "source-unreadable": "Maestro could not read that folder.",
  "outside-root": "That folder is outside the area Maestro can read.",
  "deployed-copy":
    "That folder is a copy Maestro deployed. Import from where you author the skill.",
  "missing-manifest": "That folder has no SKILL.md, so it is not a skill.",
  "invalid-frontmatter": "The SKILL.md frontmatter does not parse.",
  "empty-description": "The SKILL.md description is empty.",
};

// Beside the name input: what is wrong with the name, and nothing else.
const NAME_BLOCKER_TEXT: Record<ImportNameBlocker, string> = {
  "invalid-name":
    "Use lowercase letters, digits and single hyphens, like code-review.",
  "name-taken": "The Harness already has a skill with that name.",
};

// Reported, never blocking: a convention exceeded costs readability, not
// correctness.
const ADVISORY_TEXT: Record<ManifestAdvisory, string> = {
  "long-manifest": "SKILL.md is over 500 lines.",
  "long-description": "The description is over 1,024 characters.",
};

export const sourceBlockerText = (
  blocker: ImportSourceBlocker | null,
): string | null => (blocker === null ? null : SOURCE_BLOCKER_TEXT[blocker]);

export const nameBlockerText = (
  blocker: ImportNameBlocker | null,
): string | null => (blocker === null ? null : NAME_BLOCKER_TEXT[blocker]);

export const advisoryTexts = (
  advisories: readonly ManifestAdvisory[],
): string[] => advisories.map((advisory) => ADVISORY_TEXT[advisory]);

// Open only on a check that came back clean: no check in hand is not a refusal
// Maestro has made, and pressing on one would import something unjudged.
export const importEnabled = (check: ImportCheck | undefined): boolean =>
  check !== undefined &&
  check.sourceBlocker === null &&
  check.nameBlocker === null;
