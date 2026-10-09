import type { ManifestAdvisory, StructuralProblem } from "@maestro/core";
import type { NoticeContent } from "../ui/notice";
import type { Copy } from "../ui/phrase";

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

/** Why band 1's Create a release cannot open its plan. */
export const CREATE_RELEASE_UNAVAILABLE = {
  rereading: "re-reading Harness",
  notRead: "GitHub not read",
} as const;

export const RELEASE_UNAVAILABLE = {
  loading: "release plan still loading",
  error: "release plan did not load",
  empty: "no changes since last release",
} as const;

// Import skill's Folder path, submitted empty.
export const FOLDER_MISSING = "Enter the skill folder's absolute path.";

// Inventory's blocked Delete skill gives the same reasons.
export const DELETE_UNAVAILABLE = {
  checking: "checking your clone",
  failed: "clone not read",
  "no-harness": "no Harness connected",
  "not-in-clone": "not in your clone",
} as const;

export const DELETION_CHECKING = "Checking for uncommitted changes…";
