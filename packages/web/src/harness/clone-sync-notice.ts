import type { CloneSync } from "@maestro/core";
import type { NoticeContent } from "../ui/notice";

// Where the clone stands after a check could not move it to GitHub's default
// branch. Warning, not error: the rows still read, and every cause but `behind`
// needs the author's Git tool before Re-read Harness can help (#978).
const cloneSyncCauses: Record<
  Exclude<CloneSync, "current">,
  { message: string; detail: string }
> = {
  behind: {
    message:
      "The clone is behind the default branch. Select Re-read Harness to update it.",
    detail: "The last check could not move it forward.",
  },
  "local-changes": {
    message:
      "Your local changes are as they were. Commit or undo them in your Git tool, then select Re-read Harness.",
    detail:
      "They differ from the default branch on GitHub, so Maestro left the clone alone.",
  },
  diverged: {
    message:
      "Your local commits are as they were. Pull the default branch into the Harness clone, then select Re-read Harness.",
    detail: "The clone and GitHub each hold commits the other does not.",
  },
  "no-upstream": {
    message:
      "Set an upstream branch in your Git tool, then select Re-read Harness.",
    detail: "The checked-out branch does not follow a branch on GitHub.",
  },
  unreadable: {
    message:
      "Check the Harness clone with your Git tool, then select Re-read Harness.",
    detail: "Maestro could not read where the clone stands.",
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
        action: { label: "Re-read Harness", onClick: onRetry },
      };
