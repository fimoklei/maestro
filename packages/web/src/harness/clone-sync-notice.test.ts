import type { CloneSync } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { cloneSyncNotice } from "./clone-sync-notice";

describe("cloneSyncNotice", () => {
  const retry = () => {};
  const action = { label: "Retry check", onClick: retry };

  it.each<[Exclude<CloneSync, "current">, string, string]>([
    [
      "behind",
      "The clone is behind the default branch. Select Retry check to update it.",
      "The last check could not move it forward.",
    ],
    [
      "local-changes",
      "Your local changes are as they were. Commit or undo them in your Git tool, then select Retry check.",
      "They differ from the default branch on GitHub, so Maestro left the clone alone.",
    ],
    [
      "diverged",
      "Your local commits are as they were. Pull the default branch into the Harness clone, then select Retry check.",
      "The clone and GitHub each hold commits the other does not.",
    ],
    [
      "no-upstream",
      "Set an upstream branch in your Git tool, then select Retry check.",
      "The checked-out branch does not follow a branch on GitHub.",
    ],
    [
      "unreadable",
      "Check the Harness clone with your Git tool, then select Retry check.",
      "Maestro could not read where the clone stands.",
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
