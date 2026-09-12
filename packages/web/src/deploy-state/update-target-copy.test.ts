import { describe, expect, it } from "vitest";
import {
  BECOMES_EMPTY,
  consentRowName,
  countingSentence,
  DISCARD_LOCAL_EDITS,
  foldedHeading,
  LOADING_PREVIEW,
  localEditsSentence,
  NO_CONTENT_CHANGES,
  OVERWRITE_UNVERIFIED,
  releaseMoveLine,
  SECTION_HEADINGS,
  selectionAfterLine,
  UNVERIFIED_SENTENCE,
  UPDATE_TARGET,
  updateDialogTitle,
} from "./update-target-copy";

describe("Update target copy", () => {
  it("names the control and the confirm with one verb and object", () => {
    expect(UPDATE_TARGET).toBe("Update target");
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
    expect(releaseMoveLine("v0.3.2", "v0.3.4")).toBe(
      "This target moves from release v0.3.2 to release v0.3.4.",
    );
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

  it("folds a section behind its count", () => {
    expect(foldedHeading("Unchanged", 3)).toBe("Unchanged (3)");
    expect(foldedHeading("New in this release", 1)).toBe(
      "New in this release (1)",
    );
  });

  it("states a release that touches nothing selected", () => {
    expect(NO_CONTENT_CHANGES).toBe("No content changes");
  });

  it("states the exact Selection the update leaves behind", () => {
    expect(selectionAfterLine(["tdd", "grill", "jobs"])).toBe(
      "Selection after this update: tdd, grill and jobs.",
    );
  });

  it("states an update that leaves no skill as the Empty it makes", () => {
    expect(BECOMES_EMPTY).toBe(
      "This release removes every selected skill. The target will become Empty.",
    );
  });

  it("names both consents by the effect each one allows", () => {
    expect(DISCARD_LOCAL_EDITS).toBe("Discard local edits");
    expect(OVERWRITE_UNVERIFIED).toBe("Overwrite unverified copy");
  });

  it("says what an edited copy differs from", () => {
    expect(localEditsSentence("tdd", "v0.3.4")).toBe(
      "Your copy of tdd differs from release v0.3.4.",
    );
  });

  it("says what an unverified copy could not prove", () => {
    expect(UNVERIFIED_SENTENCE).toBe(
      "This copy could not be verified. Confirm to overwrite it.",
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
});
