import type { ActionKey } from "../ui/busy-copy";
import type { NoticeContent } from "../ui/notice";
import { importBlockerNotice } from "./notice-copy";
import type {
  ImportCheck,
  ImportNameBlocker,
  ImportSourceBlocker,
  ManifestAdvisory,
} from "./use-harness";

// The check travels with its loading and error states so the modal stays
// mounted across them — a focus trap that unmounts loses the author's place.
export type ImportCheckLoad =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; notice: NoticeContent }
  | { kind: "ready"; check: ImportCheck };

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

// No check in hand reads as adding, which is what the dialog opens on.
export const importLabels = (
  check: ImportCheck | undefined,
): { title: string; confirm: string; verb: ActionKey; hint: string } =>
  check?.mode === "update"
    ? {
        title:
          check.sourceBlocker === "nothing-to-carry-back"
            ? "No changes to update"
            : "Update a skill",
        confirm: "Update skill",
        verb: "update",
        hint: "Updating replaces the skill folder in the Harness.",
      }
    : {
        title: "Import a skill",
        confirm: "Import skill",
        verb: "import",
        hint: "Maestro uses this as the folder name and updates the name in SKILL.md to match.",
      };

// Checks the skill still imports with, so there is nothing to press.
export const advisoryNotice = (
  advisories: readonly ManifestAdvisory[],
): NoticeContent | null =>
  advisories.length === 0
    ? null
    : {
        level: "warning",
        label: "Skill checks found issues",
        message: "You can still import the skill.",
        items: advisories.map((advisory) => ADVISORY_TEXT[advisory]),
      };

// Available only on a check that came back clean: no check in hand is not a
// refusal Maestro has made, and pressing on one would import something
// unjudged. The Blocked control cause: five words or fewer.
export function importUnavailable(load: ImportCheckLoad): string | null {
  if (load.kind === "idle") return "no folder chosen yet";
  if (load.kind === "loading") return "folder check still running";
  if (load.kind === "error") return "folder check did not load";
  if (load.check.sourceBlocker !== null) return "folder cannot be used";
  if (load.check.nameBlocker !== null) return "name cannot be used";
  return null;
}
