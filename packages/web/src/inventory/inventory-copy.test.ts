import { describe, expect, it } from "vitest";
import {
  NO_FILTER_MATCH,
  NO_SEARCH_MATCH,
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

  it("names a row's checkbox after its skill", () => {
    expect(stageRowLabel("tdd")).toBe("Select tdd for bulk deploy");
  });
});
