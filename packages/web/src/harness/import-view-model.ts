// One sentence per import refusal and per convention finding, and the one rule
// that decides whether Import can be pressed. Pure, so the dialog only renders
// what this decides (#576).

import type { NoticeContent } from "../ui/notice";
import { importBlockerNotice } from "./notice-copy";
import type {
  ImportCheck,
  ImportNameBlocker,
  ImportSourceBlocker,
  ManifestAdvisory,
} from "./use-harness";

// Beside the picked folder: what is wrong with the folder itself. Each sentence
// starts where its heading in `notice-copy` stops.
const SOURCE_BLOCKER_TEXT: Record<ImportSourceBlocker, string> = {
  "source-unreadable":
    "Check that it is still on disk and readable, then pick it again.",
  "outside-root":
    "Maestro reads inside the home folder only. Pick a folder under it.",
  "deployed-copy":
    "Importing it would copy Maestro's own output back into the Harness. Pick the folder the skill is authored in.",
  "missing-manifest":
    "Without one, the folder is not a skill Maestro can carry. Pick the folder that holds the skill's SKILL.md.",
  "invalid-frontmatter":
    "Maestro cannot read the skill's name or description. Fix the SKILL.md frontmatter, then pick the folder again.",
  "empty-description":
    "The description is what tells an agent when to reach for the skill. Fill it in in SKILL.md, then pick the folder again.",
};

// Beside the name input: what is wrong with the name, and nothing else.
const NAME_BLOCKER_TEXT: Record<ImportNameBlocker, string> = {
  "invalid-name":
    "A skill name is lowercase letters, digits and single hyphens, like code-review.",
  "name-taken":
    "The Harness already holds a skill under it. Pick another name.",
};

// Reported, never blocking: a convention exceeded costs readability, not
// correctness.
const ADVISORY_TEXT: Record<ManifestAdvisory, string> = {
  "long-manifest": "SKILL.md is over 500 lines.",
  "long-description": "The description is over 1,024 characters.",
};

export const sourceBlockerNotice = (
  blocker: ImportSourceBlocker | null,
): NoticeContent | null =>
  blocker === null
    ? null
    : importBlockerNotice(blocker, SOURCE_BLOCKER_TEXT[blocker]);

export const nameBlockerNotice = (
  blocker: ImportNameBlocker | null,
): NoticeContent | null =>
  blocker === null
    ? null
    : importBlockerNotice(blocker, NAME_BLOCKER_TEXT[blocker]);

export const advisoryTexts = (
  advisories: readonly ManifestAdvisory[],
): string[] => advisories.map((advisory) => ADVISORY_TEXT[advisory]);

// Open only on a check that came back clean: no check in hand is not a refusal
// Maestro has made, and pressing on one would import something unjudged.
export const importEnabled = (check: ImportCheck | undefined): boolean =>
  check !== undefined &&
  check.sourceBlocker === null &&
  check.nameBlocker === null;
