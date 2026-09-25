import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { chooserNotice } from "./path-field-copy";

const refusal = (code: string) => new HttpError(409, "unused", code);

describe("folder chooser notices", () => {
  it.each([
    [
      "chooser-failed",
      {
        level: "error",
        label: "Folder chooser did not work",
        message: "The field did not change. Type or paste the folder path.",
      },
    ],
    [
      "chooser-busy",
      {
        level: "error",
        label: "Folder chooser already open",
        message:
          "The field did not change. Pick the folder in the open chooser.",
      },
    ],
    [
      "chooser-unavailable",
      {
        level: "error",
        label: "No folder chooser on this computer",
        message: "The field did not change. Type or paste the folder path.",
      },
    ],
  ])("%s", (code, notice) => {
    expect(chooserNotice(refusal(code))).toEqual({
      ...notice,
      detail: undefined,
    });
  });

  it("states a failure no code covers", () => {
    expect(chooserNotice(new TypeError("fetch failed"))).toEqual({
      level: "error",
      label: "Folder chooser did not open",
      message:
        "The field did not change. Select Browse to try again, or type the folder path.",
      detail: undefined,
    });
  });

  it("says nothing without a failure", () => {
    expect(chooserNotice(null)).toBeNull();
  });
});
