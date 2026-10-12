import { describe, expect, it } from "vitest";
import { unselectedControls } from "../test-utils";
import * as inventoryCopy from "./inventory-copy";
import {
  bulkRemoveReportHeading,
  checkingTargetsLine,
  LOCAL_CHANGES_NEXT_STEP,
  PINNED_LOCAL_CHANGES_NEXT_STEP,
  removeFromCountLabel,
  targetsWithoutLocalEditsNotice,
} from "./inventory-copy";

// Approved sentences, as exact strings.
describe("Inventory copy", () => {
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

  it("names the bulk Remove confirm by its targets, in one and many", () => {
    expect(removeFromCountLabel(1)).toBe("Remove from 1 target");
    expect(removeFromCountLabel(3)).toBe("Remove from 3 targets");
  });

  it("names the next step for a target left alone with local changes", () => {
    expect(LOCAL_CHANGES_NEXT_STEP).toBe(
      "Select Deploy skill to restore the released files. Then remove the skill.",
    );
    expect(PINNED_LOCAL_CHANGES_NEXT_STEP).toBe(
      "Save the changes. Restore the files from the skill's deployed version in the Harness clone. Then remove the skill.",
    );
  });
});

describe("Inventory copy that names a control", () => {
  const sentences: [string, string][] = [];
  for (const [name, value] of Object.entries(inventoryCopy)) {
    if (typeof value === "string") sentences.push([name, value]);
    else if (typeof value === "object")
      for (const [field, text] of Object.entries(value))
        if (typeof text === "string")
          sentences.push([`${name}.${field}`, text]);
  }

  it.each(sentences)(
    "names every control in %s as select {Control}",
    (_name, text) => {
      expect(unselectedControls(text)).toEqual([]);
    },
  );
});
