import { describe, expect, it } from "vitest";
import { VIEW_DEPLOY_STATE } from "../ui/control-labels";
import { plainText } from "../ui/phrase";
import { CLEAR_FILTERS } from "../ui/view-options-copy";
import {
  BULK_DEPLOY_TARGET,
  bulkDeployDidNotRun,
  bulkDeployTitle,
  bulkRemoveReportHeading,
  bulkRemoveTitle,
  CHOOSE_A_TARGET,
  checkingTargetsLine,
  DEPLOY_SKILLS,
  deployedToLine,
  globalOptionLabel,
  LOCAL_CHANGES_NEXT_STEP,
  moreTargetsLine,
  NO_FILTER_MATCH,
  NO_RELEASED_SKILLS,
  NO_SEARCH_MATCH,
  NO_TARGET_CHOSEN,
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
  skillStateLine,
  stageRowLabel,
  TARGETS_LOADING,
  TARGETS_STILL_CHECKING,
  targetsWithoutLocalEditsNotice,
  toDeployLegend,
  UP_TO_DATE_NOTE,
  upToDateLegend,
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
    expect(NO_TARGET_CHOSEN).toBe("no target");
    expect(NO_TOOL_DETECTED_CAUSE).toBe("no tool detected");
  });

  it("asks the reader to choose the bulk deploy target", () => {
    expect(CHOOSE_A_TARGET).toBe("Choose a target");
  });

  it("counts the skills the bulk deploy lists, by what it does with them", () => {
    expect(toDeployLegend(2)).toBe("To deploy · 2");
    expect(upToDateLegend(1)).toBe("Already up to date · 1");
    expect(UP_TO_DATE_NOTE).toBe("Deploy skips these skills.");
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

// The skill detail pane's state sentence (#1435).
describe("skillStateLine", () => {
  const line = (state: Parameters<typeof skillStateLine>[0]) =>
    plainText(skillStateLine(state));
  const behind = {
    kind: "behind" as const,
    count: 2,
    total: 3,
    from: "v1.3.2",
    to: "v1.4.0",
    updatable: true,
  };

  it("names the edited copies and the control that keeps them", () => {
    expect(line({ kind: "local-edits", count: 1, total: 3 })).toBe(
      "1 of 3 targets has local edits. Select Import local edits on Deploy-state to keep them.",
    );
    expect(line({ kind: "local-edits", count: 2, total: 2 })).toBe(
      "2 of 2 targets have local edits. Select Import local edits on Deploy-state to keep them.",
    );
  });

  it("names the release the behind targets follow and where Update target moves them", () => {
    expect(line(behind)).toBe(
      "2 of 3 targets follow v1.3.2. Select Update target to move them to v1.4.0.",
    );
    expect(line({ ...behind, count: 1, total: 1 })).toBe(
      "1 of 1 target follows v1.3.2. Select Update target to move it to v1.4.0.",
    );
  });

  it("says an older release where the behind targets follow different ones", () => {
    expect(line({ ...behind, from: null })).toBe(
      "2 of 3 targets follow an older release. Select Update target to move them to v1.4.0.",
    );
  });

  it("names the latest release in words while its tag is not read", () => {
    expect(line({ ...behind, to: null })).toBe(
      "2 of 3 targets follow v1.3.2. Select Update target to move them to the latest release.",
    );
  });

  it("names no Update target where no behind target offers it", () => {
    expect(line({ ...behind, updatable: false })).toBe(
      "2 of 3 targets follow v1.3.2.",
    );
  });

  it("names Re-read Inventory where a check could not answer", () => {
    expect(line({ kind: "unknown" })).toBe(
      "Some targets could not be checked. Select Re-read Inventory to try again.",
    );
  });

  it("says no newer release changes an up-to-date skill", () => {
    expect(line({ kind: "up-to-date" })).toBe(
      "No newer release changes this skill.",
    );
  });
});
