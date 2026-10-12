import { describe, expect, it } from "vitest";
import { unselectedControls } from "../test-utils";
import * as inventoryCopy from "./inventory-copy";
import { LOCAL_CHANGES_NEXT_STEP } from "./inventory-copy";

// Approved sentences, as exact strings.
describe("Inventory copy", () => {
  it("names the next step for a target left alone with local changes", () => {
    expect(LOCAL_CHANGES_NEXT_STEP).toBe(
      "Select Deploy skill to restore the released files. Then remove the skill.",
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
