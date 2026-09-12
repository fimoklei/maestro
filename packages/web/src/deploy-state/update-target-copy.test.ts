import { describe, expect, it } from "vitest";
import {
  BECOMES_EMPTY,
  CLOSE,
  consentRowName,
  countingSentence,
  DISCARD_LOCAL_EDITS,
  foldedHeading,
  LOADING_PREVIEW,
  localEditsSentence,
  MIXED_RELEASES,
  NO_CONTENT_CHANGES,
  OVERWRITE_UNVERIFIED,
  outcomeLine,
  RETRY_UPDATE,
  releaseMoveLine,
  SECTION_HEADINGS,
  selectionAfterLine,
  UNVERIFIED_SENTENCE,
  UPDATE_INCOMPLETE,
  UPDATE_INCOMPLETE_SENTENCE,
  UPDATE_TARGET,
  updateDialogTitle,
  updatingLine,
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

  it("reads the release it is moving to while apm runs", () => {
    expect(updatingLine("v0.3.4")).toBe("Updating to v0.3.4…");
  });

  it("names a half-landed update on the card", () => {
    expect(MIXED_RELEASES).toBe("Mixed releases");
  });

  it("states one outcome per skill, from what was read back", () => {
    const releases = { from: "v0.3.2", to: "v0.3.4" };
    expect(
      outcomeLine({ name: "tdd", tool: null, state: "updated" }, releases),
    ).toBe("tdd updated to v0.3.4");
    expect(
      outcomeLine({ name: "review", tool: null, state: "removed" }, releases),
    ).toBe("review removed");
    expect(
      outcomeLine(
        { name: "grill", tool: null, state: "not-updated" },
        releases,
      ),
    ).toBe("grill still at v0.3.2");
    expect(
      outcomeLine(
        { name: "review", tool: null, state: "not-removed" },
        releases,
      ),
    ).toBe("review still deployed");
    expect(
      outcomeLine({ name: "grill", tool: null, state: "unknown" }, releases),
    ).toBe("grill outcome unknown");
  });

  it("names the tool of an outcome the global target answers per tool", () => {
    expect(
      outcomeLine(
        { name: "grill", tool: "codex", state: "not-updated" },
        { from: "v0.3.2", to: "v0.3.4" },
      ),
    ).toBe("grill still at v0.3.2 in Codex");
  });

  it("names the one way out of a half-landed update", () => {
    expect(UPDATE_INCOMPLETE).toBe("Update incomplete");
    expect(RETRY_UPDATE).toBe("Retry update");
    expect(UPDATE_INCOMPLETE_SENTENCE).toBe(
      "The update is incomplete. Select Retry update to run the same release again.",
    );
  });

  it("leaves one control once the outcome is in", () => {
    expect(CLOSE).toBe("Close");
  });
});
