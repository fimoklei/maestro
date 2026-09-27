import { describe, expect, it } from "vitest";
import { ACTION_STILL_RUNNING, CANCEL, CLOSE } from "./dialog-copy";

describe("Dialog copy", () => {
  it("names the leave control before and after the action", () => {
    expect(CANCEL).toBe("Cancel");
    expect(CLOSE).toBe("Close");
  });

  it("states why the ✕ waits while the action runs", () => {
    expect(ACTION_STILL_RUNNING).toBe("action still running");
  });
});
