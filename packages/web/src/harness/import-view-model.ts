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

// Beside the picked folder the way through is to pick again, not to import, so
// only the two rows whose table sentence sends the author to Import skill are
// written twice. The rest take `notice-copy`'s row as it stands.
const SOURCE_BLOCKER_TEXT: Partial<Record<ImportSourceBlocker, string>> = {
  "invalid-frontmatter":
    "Fix the SKILL.md frontmatter, then pick the folder again.",
  "empty-description":
    "Fill in the description in SKILL.md, then pick the folder again.",
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

// The name's two refusals already end on "Pick another name", which is what
// the input beside them asks for, so the table's row needs no second wording.
export const nameBlockerNotice = (
  blocker: ImportNameBlocker | null,
): NoticeContent | null =>
  blocker === null ? null : importBlockerNotice(blocker);

// The dialog's own words for the two outcomes one control has: adding a skill
// the Harness does not hold, or replacing one it does (CONTEXT.md → Screen
// names). No check in hand reads as adding, which is what the dialog opens on.
export const importLabels = (
  check: ImportCheck | undefined,
): { title: string; confirm: string; busy: string; hint: string } =>
  check?.mode === "update"
    ? {
        title:
          check.sourceBlocker === "nothing-to-carry-back"
            ? "No changes to update"
            : "Update a skill",
        confirm: "Update skill",
        busy: "Updating…",
        hint: "Updating replaces the skill folder in the Harness.",
      }
    : {
        title: "Import a skill",
        confirm: "Import skill",
        busy: "Importing…",
        hint: "Maestro uses this as the folder name and updates the name in SKILL.md to match.",
      };

export const advisoryTexts = (
  advisories: readonly ManifestAdvisory[],
): string[] => advisories.map((advisory) => ADVISORY_TEXT[advisory]);

// Open only on a check that came back clean: no check in hand is not a refusal
// Maestro has made, and pressing on one would import something unjudged.
export const importEnabled = (check: ImportCheck | undefined): boolean =>
  check !== undefined &&
  check.sourceBlocker === null &&
  check.nameBlocker === null;
