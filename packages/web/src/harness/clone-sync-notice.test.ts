import type { CloneSync } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { cloneSyncNotice } from "./clone-sync-notice";

describe("cloneSyncNotice", () => {
  const retry = () => {};
  const action = { label: "Re-read Harness", onClick: retry };

  it.each<[Exclude<CloneSync, "current">, string, string]>([
    [
      "behind",
      "The clone is behind the default branch. Select Re-read Harness to update it.",
      "The last check couldn't move it forward.",
    ],
    [
      "local-changes",
      "Your local changes are as they were. Commit or undo them in your Git tool, then select Re-read Harness.",
      "They differ from the default branch on GitHub, so Maestro left the clone alone.",
    ],
    [
      "diverged",
      "Your local commits are as they were. Pull the default branch into your clone, then select Re-read Harness.",
      "The clone and GitHub each hold commits the other doesn't.",
    ],
    [
      "no-upstream",
      "Set an upstream branch in your Git tool, then select Re-read Harness.",
      "The checked-out branch doesn't follow a branch on GitHub.",
    ],
    [
      "unreadable",
      "Check your clone with your Git tool, then select Re-read Harness.",
      "Maestro couldn't read where the clone stands.",
    ],
  ])("states the whole notice for %s", (sync, message, detail) => {
    expect(cloneSyncNotice(sync, retry)).toEqual({
      level: "warning",
      label: "Harness clone not updated",
      message,
      detail,
      action,
    });
  });

  it("shows nothing for a clone at its upstream", () => {
    expect(cloneSyncNotice("current", retry)).toBeNull();
  });
});
