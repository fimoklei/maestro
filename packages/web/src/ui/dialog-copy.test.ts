import { describe, expect, it } from "vitest";
import { CANCEL, CLOSE } from "./dialog-copy";

describe("Dialog copy", () => {
  it("names the leave control before and after the action", () => {
    expect(CANCEL).toBe("Cancel");
    expect(CLOSE).toBe("Close");
  });
});
