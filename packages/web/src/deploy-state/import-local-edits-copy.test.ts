import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import {
  importConfirmLabel,
  importedToast,
  importReportHeading,
  localEditsCheckNotice,
  localEditsImportNotice,
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
