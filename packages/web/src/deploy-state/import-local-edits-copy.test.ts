import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import {
  cannotBeImportedLegend,
  IMPORTED_NEXT_STEP,
  importConfirmLabel,
  importedToast,
  importReportHeading,
  localEditsCheckNotice,
  localEditsImportNotice,
  NO_LOCAL_EDITS,
  NO_SKILL_QUALIFIES,
  noLocalEditsLine,
} from "./import-local-edits-copy";

describe("Import local edits… copy", () => {
  it("counts the checked skills in the confirm", () => {
    expect(importConfirmLabel(0)).toBe("Import skills");
    expect(importConfirmLabel(1)).toBe("Import 1 skill");
    expect(importConfirmLabel(3)).toBe("Import 3 skills");
  });

  it("names one landed skill in the toast and counts several", () => {
    expect(importedToast(["code-review"])).toBe("Imported code-review.");
    expect(importedToast(["code-review", "tdd"])).toBe("Imported 2 skills.");
  });

  it("heads a partial run with what landed of what was asked", () => {
    expect(importReportHeading(1, 2)).toBe("Imported 1 of 2 skills");
    expect(importReportHeading(0, 1)).toBe("Imported 0 of 1 skill");
  });

  it("names the refused group, an empty target and the landed skills' next step", () => {
    expect(cannotBeImportedLegend(2)).toBe("✕ Cannot be imported · 2");
    expect(NO_SKILL_QUALIFIES).toBe("no skill qualifies");
    expect(NO_LOCAL_EDITS).toBe("No local edits");
    expect(noLocalEditsLine("…/me/project")).toBe(
      "No skill on …/me/project changed after deployment.",
    );
    expect(IMPORTED_NEXT_STEP).toBe(
      "Each is now a Pending proposal on the Harness screen. Select Propose change there.",
    );
  });

  it("states a failed check as nothing imported", () => {
    expect(
      localEditsCheckNotice(new HttpError(422, "x", "target-unreadable")),
    ).toMatchObject({
      label: "Local edits not checked",
      message:
        "Nothing was imported. Select Close, then Import local edits… again.",
    });
  });

  it("tells a held Harness lock from a refused and an unanswered run", () => {
    expect(
      localEditsImportNotice(new HttpError(409, "x", "import-in-progress")),
    ).toMatchObject({
      label: "Harness already changing",
      message:
        "Wait for that change to finish, then select Import local edits… again.",
    });
    expect(
      localEditsImportNotice(new HttpError(409, "x", "unfinished-operation")),
    ).toMatchObject({ label: "Local edits not checked" });
    expect(localEditsImportNotice(new TypeError("fetch failed"))).toMatchObject(
      {
        label: "Import not confirmed",
        message:
          "The Maestro server did not answer, so some skills may have landed. Select Close, then check the Harness screen.",
      },
    );
  });
});
