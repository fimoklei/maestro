import { describe, expect, it } from "vitest";
import {
  BULK_DEPLOY_TARGET,
  bulkDeployDidNotRun,
  bulkDeployTitle,
  DEPLOY_SKILLS,
  deployedToLine,
  LOADING_TARGETS,
  moreTargetsLine,
  NO_FILTER_MATCH,
  NO_SEARCH_MATCH,
  NOT_DEPLOYED_ANYWHERE,
  NOT_READ_YET,
  rowActionsLabel,
  SELECT_ALL_LABEL,
  SOME_TARGETS_NOT_READ,
  stageRowLabel,
} from "./inventory-copy";

// Approved sentences, as exact strings (copy.md → Patterns).
describe("Inventory copy", () => {
  it("says how to see every skill when the search matches none", () => {
    expect(NO_SEARCH_MATCH).toBe(
      "No skills match the search. Clear the search box to see every skill.",
    );
  });

  it("names the Filter control when the filters hide every skill", () => {
    expect(NO_FILTER_MATCH).toBe(
      "No skills match the filters. Select Filter to show more skills.",
    );
  });

  it("heads the rows whose status has not answered yet", () => {
    expect(NOT_READ_YET).toBe("Not read yet");
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

  it("heads a bulk deploy the server never answered, and the wait for targets", () => {
    expect(bulkDeployDidNotRun("maestro")).toBe(
      "Deploy to maestro did not run",
    );
    expect(LOADING_TARGETS).toBe("Loading targets…");
  });

  it("heads the hover card with the reach, in zero, one and many", () => {
    expect(deployedToLine(0)).toBe("Not deployed to any target.");
    expect(deployedToLine(1)).toBe("Deployed to 1 target");
    expect(deployedToLine(12)).toBe("Deployed to 12 targets");
  });

  it("names the row as the way to every target the card leaves out", () => {
    expect(moreTargetsLine(2, 5)).toBe(
      "2 more. Select the row to see all 5 targets.",
    );
  });

  it("says when a target's read did not answer", () => {
    expect(SOME_TARGETS_NOT_READ).toBe("Some targets could not be read.");
  });

  it("tells the pane's reader how to deploy a skill that is nowhere yet", () => {
    expect(NOT_DEPLOYED_ANYWHERE).toBe(
      "Not deployed to any target. Choose a target below, then select Deploy skill.",
    );
  });

  it("names a row's menu after its skill", () => {
    expect(rowActionsLabel("tdd")).toBe("Actions for tdd");
  });
});
