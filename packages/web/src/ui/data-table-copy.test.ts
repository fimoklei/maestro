import { describe, expect, it } from "vitest";
import { keyHint } from "./data-table-copy";

describe("keyHint", () => {
  it("says every key, one sentence each", () => {
    expect(
      keyHint({ checksRows: true, checksAll: true, opensMenu: true }),
    ).toBe(
      "Space or X checks a row. Ctrl+A checks all rows. Shift+F10 opens the row menu.",
    );
  });

  it("leaves out a key the table has no use for", () => {
    expect(
      keyHint({ checksRows: false, checksAll: false, opensMenu: true }),
    ).toBe("Shift+F10 opens the row menu.");
    expect(
      keyHint({ checksRows: true, checksAll: false, opensMenu: false }),
    ).toBe("Space or X checks a row.");
  });

  it("says nothing where no key applies", () => {
    expect(
      keyHint({ checksRows: false, checksAll: false, opensMenu: false }),
    ).toBeNull();
  });
});
