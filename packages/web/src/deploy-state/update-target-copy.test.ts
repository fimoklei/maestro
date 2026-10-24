import { describe, expect, it } from "vitest";
import { machineValues, unselectedControls } from "../test-utils";
import * as updateTargetCopy from "./update-target-copy";
import {
  CHECK_EVERY_BOX,
  outcomeDetail,
  releaseMoveLine,
} from "./update-target-copy";

describe("the Update target cause", () => {
  it("keeps the approved sentence for a missing consent", () => {
    expect(CHECK_EVERY_BOX).toBe(
      "To update this target, check every box above.",
    );
  });
});

// Contract tests: the words live once, in the copy module and the rendered
// tests of the Update target dialog, its outcome report and the target pane.
// These prove the rules every sentence keeps.

describe("Update target copy that names a control", () => {
  const sentences = Object.entries(updateTargetCopy).flatMap(
    ([name, value]): [string, string][] =>
      typeof value === "string" ? [[name, value]] : [],
  );

  it.each(sentences)(
    "names every control in %s as select {Control}",
    (_name, text) => {
      expect(unselectedControls(text)).toEqual([]);
    },
  );
});

describe("a release in these sentences", () => {
  const releases = { from: "v0.3.2", to: "v0.3.4" };

  // #1458: the versions are the machine values; the words stay Geist.
  it("is set apart in the release move line", () => {
    expect(machineValues(releaseMoveLine("v0.3.2", "v0.3.4"))).toEqual([
      "v0.3.2",
      "v0.3.4",
    ]);
  });

  it("is set apart where a failed skill stays at or loses it", () => {
    expect(machineValues(outcomeDetail("not-updated", releases, true))).toEqual(
      ["v0.3.2"],
    );
    expect(machineValues(outcomeDetail("not-removed", releases, true))).toEqual(
      ["v0.3.4"],
    );
  });
});
