import { describe, expect, it } from "vitest";
import { ACTIONS_COLUMN_LABEL, rowActionsLabel } from "./row-menu-copy";

describe("row menu copy", () => {
  it("names the column, and a row's menu after its row", () => {
    expect(ACTIONS_COLUMN_LABEL).toBe("Actions");
    expect(rowActionsLabel("tdd")).toBe("Actions for tdd");
  });
});
