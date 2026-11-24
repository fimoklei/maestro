import type { CloneSync } from "@maestro/core";
import { rereadLabel } from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";

// Where the clone stands after a check could not move it to GitHub's default
// branch. Warning, not error: the rows still read, and every cause but `behind`
// needs the author's Git tool before Re-read Harness can help (#978).
const cloneSyncCauses: Record<
  Exclude<CloneSync, "current">,
  { message: string; detail: string }
> = {
  behind: {
    message: `The clone is behind the default branch. Select ${rereadLabel("Harness")} to update it.`,
    detail: "The last check couldn't move it forward.",
  },
  "local-changes": {
    message: `Your local changes are as they were. Commit or undo them in your Git tool, then select ${rereadLabel("Harness")}.`,
    detail:
      "They differ from the default branch on GitHub, so Maestro left the clone alone.",
  },
  diverged: {
    message: `Your local commits are as they were. Pull the default branch into your clone, then select ${rereadLabel("Harness")}.`,
    detail: "The clone and GitHub each hold commits the other doesn't.",
  },
  "no-upstream": {
    message: `Set an upstream branch in your Git tool, then select ${rereadLabel("Harness")}.`,
    detail: "The checked-out branch doesn't follow a branch on GitHub.",
  },
  unreadable: {
    message: `Check your clone with your Git tool, then select ${rereadLabel("Harness")}.`,
    detail: "Maestro couldn't read where the clone stands.",
  },
};

export const cloneSyncNotice = (
  sync: CloneSync,
  onRetry: () => void,
): NoticeContent | null =>
  sync === "current"
    ? null
    : {
        level: "warning",
        label: "Harness clone not updated",
        ...cloneSyncCauses[sync],
        action: { label: rereadLabel("Harness"), onClick: onRetry },
      };
