import { describe, expect, it } from "vitest";
import { machineValues } from "../test-utils";
import { UPDATE_TARGET } from "../ui/control-labels";
import { plainText } from "../ui/phrase";
import {
  BECOMES_EMPTY,
  CONSENT_NOT_GIVEN,
  consentRowName,
  countingSentence,
  DISCARD_LOCAL_EDITS,
  foldedHeading,
  KEEP_WORK_BY_IMPORTING,
  LOADING_PREVIEW,
  localEditsSentence,
  NO_CONTENT_CHANGES,
  NO_GITHUB_ORIGIN,
  NOT_ADDED,
  OVERWRITE_UNVERIFIED,
  outcomeDetail,
  outcomeHeading,
  RETRY_UPDATE,
  releaseMoveLine,
  SECTION_HEADINGS,
  UPDATE_INCOMPLETE,
  UPDATE_INCOMPLETE_SENTENCE,
  unverifiedSentence,
  updateDialogTitle,
} from "./update-target-copy";

describe("Update target copy", () => {
  it("names the control and the confirm with one verb and object", () => {
    expect(UPDATE_TARGET).toBe("Update target");
  });

  it("states the cause on the control an origin-less Harness blocks", () => {
    expect(NO_GITHUB_ORIGIN).toBe("no GitHub origin");
  });

  it("states the cause on the control until every consent is given", () => {
    expect(CONSENT_NOT_GIVEN).toBe("consent not given");
  });

  it("titles the dialog with the target it acts on", () => {
    expect(updateDialogTitle("agent-harness")).toBe("Update agent-harness");
  });

  it("opens with the size of the change", () => {
    expect(countingSentence({ changed: 2, removed: 1, unchanged: 3 })).toBe(
      "Updates 2 skills, removes 1, leaves 3 unchanged.",
    );
  });

  it("counts one skill in the singular", () => {
    expect(countingSentence({ changed: 1, removed: 0, unchanged: 0 })).toBe(
      "Updates 1 skill, removes 0, leaves 0 unchanged.",
    );
  });

  it("counts nothing changed without dropping the sentence", () => {
    expect(countingSentence({ changed: 0, removed: 0, unchanged: 5 })).toBe(
      "Updates 0 skills, removes 0, leaves 5 unchanged.",
    );
  });

  it("names the release the target leaves and the one it adopts", () => {
    const move = releaseMoveLine("v0.3.2", "v0.3.4");
    expect(plainText(move)).toBe("release v0.3.2 → v0.3.4");
    // #1458: the versions are the machine values; the words stay Geist.
    expect(machineValues(move)).toEqual(["v0.3.2", "v0.3.4"]);
  });

  it("heads the six sections in one fixed order", () => {
    expect(SECTION_HEADINGS).toStrictEqual([
      "Added by this deploy",
      "Changed",
      "Removed by this release",
      "Local edits",
      "Unchanged",
      "New in this release",
    ]);
  });

  it("says New in this release adds nothing by itself", () => {
    expect(NOT_ADDED).toBe("not added");
  });

  it("folds a section behind its count", () => {
    expect(foldedHeading("Unchanged", 3)).toBe("Unchanged (3)");
    expect(foldedHeading("New in this release", 1)).toBe(
      "New in this release (1)",
    );
  });

  it("states a release that touches nothing selected", () => {
    expect(NO_CONTENT_CHANGES).toBe("No content changes");
  });

  it("states an update that leaves no skill as the Empty it makes", () => {
    expect(BECOMES_EMPTY).toBe(
      "This release removes every selected skill. The target will become Empty.",
    );
  });

  it("names both consents by the effect each one allows", () => {
    expect(DISCARD_LOCAL_EDITS).toBe("Discard local edits");
    expect(KEEP_WORK_BY_IMPORTING).toBe(
      "To keep the edits instead, select Cancel, then Import local edits.",
    );
    expect(OVERWRITE_UNVERIFIED).toBe("Overwrite unverified copy");
  });

  it("says what an edited copy differs from", () => {
    expect(plainText(localEditsSentence("tdd", "v0.3.4"))).toBe(
      "tdd has local edits. This update replaces them with release v0.3.4.",
    );
  });

  it("says what an unverified copy could not prove", () => {
    expect(plainText(unverifiedSentence("jobs"))).toBe(
      "jobs could not be verified. This update overwrites it.",
    );
  });

  it("names a copy by its skill, and by its tool where the target has tools", () => {
    expect(consentRowName({ name: "tdd", tool: null })).toBe("tdd");
    expect(consentRowName({ name: "tdd", tool: "claude" })).toBe(
      "tdd in Claude Code",
    );
  });

  it("names what is loading by the screen it is for", () => {
    expect(LOADING_PREVIEW).toBe("Loading the update preview…");
  });

  it("heads the outcome by whether every skill reached the release", () => {
    expect(outcomeHeading("v0.3.4", "landed")).toBe("Updated to v0.3.4");
    expect(outcomeHeading("v0.3.4", "failed")).toBe(
      "Not every skill reached v0.3.4",
    );
    expect(outcomeHeading("v0.3.4", "unconfirmed")).toBe(
      "Maestro could not confirm every skill reached v0.3.4",
    );
  });

  it("states each failure's cause and next step, from what was read back", () => {
    const releases = { from: "v0.3.2", to: "v0.3.4" };
    expect(plainText(outcomeDetail("not-updated", releases, true))).toBe(
      "Still at v0.3.2. Select Retry update to run the same release again.",
    );
    expect(plainText(outcomeDetail("missing", releases, true))).toBe(
      "Not deployed. Select Retry update to run the same release again.",
    );
    expect(plainText(outcomeDetail("not-removed", releases, true))).toBe(
      "Still deployed, though v0.3.4 drops it. Select Retry update to run the same release again.",
    );
    expect(plainText(outcomeDetail("not-updated", releases, false))).toBe(
      "Still at v0.3.2. Check the target on the Deploy-state screen, then select Update target again.",
    );
    expect(plainText(outcomeDetail("unknown", releases, false))).toBe(
      "Maestro could not read this skill back. Check its state on the Deploy-state screen.",
    );
  });

  it("sets the release a failed skill stays at or loses apart", () => {
    const releases = { from: "v0.3.2", to: "v0.3.4" };
    expect(machineValues(outcomeDetail("not-updated", releases, true))).toEqual(
      ["v0.3.2"],
    );
    expect(machineValues(outcomeDetail("not-removed", releases, true))).toEqual(
      ["v0.3.4"],
    );
  });

  it("names the one way out of a half-landed update", () => {
    expect(UPDATE_INCOMPLETE).toBe("Update incomplete");
    expect(RETRY_UPDATE).toBe("Retry update");
    expect(UPDATE_INCOMPLETE_SENTENCE).toBe(
      "The update is incomplete. Select Retry update to run the same release again.",
    );
  });
});
