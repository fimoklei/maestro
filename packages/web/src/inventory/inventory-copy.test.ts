import { describe, expect, it } from "vitest";
import { VIEW_DEPLOY_STATE } from "../ui/control-labels";
import { plainText } from "../ui/phrase";
import {
  BULK_DEPLOY_TARGET,
  bulkDeployDidNotRun,
  bulkDeployTitle,
  cleanCopiesNotice,
  DEPLOY_SKILLS,
  deployedToLine,
  globalOptionLabel,
  moreTargetsLine,
  NO_FILTER_MATCH,
  NO_RELEASED_SKILLS,
  NO_SEARCH_MATCH,
  NO_TARGET_REMOVABLE,
  NO_TOOL_DETECTED_CAUSE,
  NOT_DEPLOYED_ANYWHERE,
  REMOVE_FROM_TARGET,
  removeFromAllLabel,
  removeFromToolsLabel,
  SELECT_ALL_LABEL,
  SOME_TARGETS_NOT_READ,
  skillStateLine,
  stageRowLabel,
  TARGETS_LOADING,
  TARGETS_STILL_CHECKING,
} from "./inventory-copy";

// Approved sentences, as exact strings.
describe("Inventory copy", () => {
  it("says how to see every skill when the search matches none", () => {
    expect(NO_SEARCH_MATCH).toEqual({
      title: "No skills match the search",
      description: "Clear the search box to see every skill.",
    });
  });

  it("names the Filter control when the filters hide every skill", () => {
    expect(NO_FILTER_MATCH).toEqual({
      title: "No skills match the filters",
      description: "Select Filter to show more skills.",
    });
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

  // #1458: the bulk Remove dialog's clean copies, as a success notice.
  it("counts the clean copies in one and many, with what the removal takes", () => {
    expect(cleanCopiesNotice(1)).toEqual({
      label: "1 clean copy",
      message: "Only the deployed files are removed.",
    });
    expect(cleanCopiesNotice(3).label).toBe("3 clean copies");
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
