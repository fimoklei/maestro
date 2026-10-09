import { describe, expect, it } from "vitest";
import { VIEW_DEPLOY_STATE } from "../ui/control-labels";
import { CLEAR_FILTERS } from "../ui/view-options-copy";
import {
  BULK_DEPLOY_TARGET,
  bulkDeployDidNotRun,
  bulkDeployTitle,
  bulkRemoveConfirmLabel,
  bulkRemoveReportHeading,
  bulkRemoveTitle,
  checkingTargetsLine,
  DEPLOY_SKILLS,
  deployedToLine,
  globalOptionLabel,
  LOCAL_CHANGES_NEXT_STEP,
  moreTargetsLine,
  NO_FILTER_MATCH,
  NO_RELEASED_SKILLS,
  NO_SEARCH_MATCH,
  NO_TARGET_REMOVABLE,
  NO_TOOL_DETECTED_CAUSE,
  NOT_DEPLOYED_ANYWHERE,
  PINNED_LOCAL_CHANGES_NEXT_STEP,
  REMOVE_FROM_TARGET,
  removeFromAllLabel,
  removeFromToolsLabel,
  SELECT_ALL_LABEL,
  SOME_TARGETS_NOT_READ,
  shownSkillsMeta,
  stageRowLabel,
  TARGETS_LOADING,
  TARGETS_STILL_CHECKING,
  targetsWithoutLocalEditsNotice,
} from "./inventory-copy";

// Approved sentences, as exact strings.
describe("Inventory copy", () => {
  it("says how to see every skill when the search matches none", () => {
    expect(NO_SEARCH_MATCH).toEqual({
      title: "No skills match the search",
      description: "Clear the search box to see every skill.",
    });
  });

  it("offers Clear filters when the filters hide every skill", () => {
    expect(CLEAR_FILTERS).toBe("Clear filters");
    expect(NO_FILTER_MATCH).toEqual({
      title: "No skills match the filters",
      description: "Select Clear filters to see every skill.",
    });
  });

  it("counts the skills a search or filter shows against all of them", () => {
    expect(shownSkillsMeta(34, 34)).toBe("34 skills");
    expect(shownSkillsMeta(1, 1)).toBe("1 skill");
    expect(shownSkillsMeta(0, 34)).toBe("0 of 34 skills");
    expect(shownSkillsMeta(1, 34)).toBe("1 of 34 skills");
  });

  it("names a row's checkbox after its skill", () => {
    expect(stageRowLabel("tdd")).toBe("Select tdd for bulk deploy");
  });

  it("names the header's checkbox for every shown skill", () => {
    expect(SELECT_ALL_LABEL).toBe("Select all for bulk deploy");
  });

  it("titles the bulk deploy dialog by its count, in one and many", () => {
    expect(DEPLOY_SKILLS).toBe("Deploy skills");
    expect(bulkDeployTitle(1)).toBe("Deploy 1 skill");
    expect(bulkDeployTitle(34)).toBe("Deploy 34 skills");
    expect(BULK_DEPLOY_TARGET).toBe("Target");
  });

  it("heads a bulk deploy the server never answered", () => {
    expect(bulkDeployDidNotRun("maestro")).toBe(
      "Deploy to maestro did not run",
    );
  });

  it("states why a bulk deploy cannot run yet", () => {
    expect(TARGETS_LOADING).toBe("targets still loading");
    expect(NO_TOOL_DETECTED_CAUSE).toBe("no tool detected");
  });

  it("states why a bulk remove cannot run yet", () => {
    expect(TARGETS_STILL_CHECKING).toBe("checking for local edits");
    expect(NO_TARGET_REMOVABLE).toBe("no target can be removed");
  });

  // #1458, #1436: the bulk Remove dialog's targets that lose no work.
  it("counts the targets without local edits, with what the removal takes", () => {
    expect(targetsWithoutLocalEditsNotice(1)).toEqual({
      label: "1 target without local edits",
      message: "Only the deployed files are removed.",
    });
    expect(targetsWithoutLocalEditsNotice(3).label).toBe(
      "3 targets without local edits",
    );
  });

  // #1436: every bulk Remove count in one and many.
  it("titles the bulk Remove dialog by its targets, in one and many", () => {
    expect(bulkRemoveTitle("tdd", 1)).toBe("Remove tdd from 1 target");
    expect(bulkRemoveTitle("tdd", 3)).toBe("Remove tdd from 3 targets");
  });

  it("names what the bulk Remove confirm acts on, in one and many", () => {
    expect(bulkRemoveConfirmLabel(1, 0)).toBe("Remove from 1 target");
    expect(bulkRemoveConfirmLabel(3, 0)).toBe("Remove from 3 targets");
    expect(bulkRemoveConfirmLabel(1, 1)).toBe(
      "Remove from 1 target · 1 loses local edits",
    );
    expect(bulkRemoveConfirmLabel(3, 2)).toBe(
      "Remove from 3 targets · 2 lose local edits",
    );
  });

  it("counts the bulk Remove checks that answered, in one and many", () => {
    expect(checkingTargetsLine(1, 0)).toBe("Checking 1 target — 0 answered");
    expect(checkingTargetsLine(3, 1)).toBe("Checking 3 targets — 1 answered");
  });

  it("heads the bulk Remove Report, in one and many", () => {
    expect(bulkRemoveReportHeading(1, 1)).toBe("Removed from 1 target");
    expect(bulkRemoveReportHeading(3, 3)).toBe("Removed from 3 targets");
    expect(bulkRemoveReportHeading(0, 1)).toBe("Removed from 0 of 1 target");
    expect(bulkRemoveReportHeading(1, 3)).toBe("Removed from 1 of 3 targets");
  });

  it("names the next step for a target left alone with local changes", () => {
    expect(LOCAL_CHANGES_NEXT_STEP).toBe(
      "Select Deploy skill to restore the released files. Then remove the skill.",
    );
    expect(PINNED_LOCAL_CHANGES_NEXT_STEP).toBe(
      "Save the changes. Restore the files from the skill's deployed version in the Harness clone. Then remove the skill.",
    );
  });

  it("heads the hover card with the reach, in zero, one and many", () => {
    expect(deployedToLine(0)).toBe("Not deployed to any target.");
    expect(deployedToLine(1)).toBe("Deployed to 1 target.");
    expect(deployedToLine(12)).toBe("Deployed to 12 targets.");
  });

  // A hover card holds facts only, never an action.
  it("counts the targets the card leaves out", () => {
    expect(moreTargetsLine(2)).toBe("And 2 more.");
  });

  it("offers Open Harness from the empty Inventory", () => {
    expect(NO_RELEASED_SKILLS).toEqual({
      title: "No released skills yet",
      description: "Skills from the latest release appear here.",
    });
  });

  it("says when a target's read did not answer", () => {
    expect(SOME_TARGETS_NOT_READ).toBe("Some targets could not be read.");
  });

  it("tells the pane's reader how to deploy a skill that is nowhere yet", () => {
    // Deploy skill opens the dialog where the target is chosen (#1065).
    expect(NOT_DEPLOYED_ANYWHERE).toBe(
      "Not deployed to any target. Select Deploy skill to choose a target.",
    );
  });

  // A target row's ⋮ and the pane's foot (#1065).
  it("names a target row's actions and the foot's removal", () => {
    expect(REMOVE_FROM_TARGET).toBe("Remove from target");
    expect(VIEW_DEPLOY_STATE).toBe("View Deploy-state");
    expect(removeFromAllLabel(3)).toBe("Remove from all 3 targets");
    expect(removeFromAllLabel(2)).toBe("Remove from all 2 targets");
  });

  // A global removal takes every detected tool, so a global row names them all.
  it("names every tool a global row's removal takes", () => {
    expect(removeFromToolsLabel(["claude", "codex"])).toBe(
      "Remove from Claude Code and Codex",
    );
    expect(removeFromToolsLabel(["claude"])).toBe("Remove from Claude Code");
  });
});

describe("globalOptionLabel", () => {
  it("names both detected tools", () => {
    expect(globalOptionLabel(["claude", "codex"])).toBe(
      "Global (Claude Code + Codex)",
    );
  });

  it("names a single detected tool", () => {
    expect(globalOptionLabel(["claude"])).toBe("Global (Claude Code)");
  });

  it("says no tool detected for an empty set", () => {
    expect(globalOptionLabel([])).toBe("Global (no tool detected)");
  });

  it("falls back to plain Global while the tool set is unknown", () => {
    // Loading or unreadable: never claim a tool set we cannot prove.
    expect(globalOptionLabel(undefined)).toBe("Global");
  });
});
