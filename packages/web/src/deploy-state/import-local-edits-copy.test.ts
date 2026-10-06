import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { machineValues } from "../test-utils";
import { plainText } from "../ui/phrase";
import {
  cannotBeImportedLegend,
  IMPORTED_NEXT_STEP,
  importConfirmLabel,
  importReportHeading,
  localEditsCheckNotice,
  localEditsImportNotice,
  NO_LOCAL_EDITS,
  NO_SKILL_QUALIFIES,
  noLocalEditsLine,
  undoesNewerLegend,
  undoesNewerLine,
} from "./import-local-edits-copy";

describe("Import local edits copy", () => {
  it("counts the checked skills in the confirm", () => {
    expect(importConfirmLabel(0, 0)).toBe("Import skills");
    expect(importConfirmLabel(1, 0)).toBe("Import 1 skill");
    expect(importConfirmLabel(3, 0)).toBe("Import 3 skills");
  });

  it("counts the checked skills that undo newer Harness changes", () => {
    expect(importConfirmLabel(1, 1)).toBe(
      "Import 1 skill · 1 undoes newer changes",
    );
    expect(importConfirmLabel(3, 2)).toBe(
      "Import 3 skills · 2 undo newer changes",
    );
  });

  it("names the group that undoes newer Harness changes and its release", () => {
    expect(undoesNewerLegend(2)).toBe("▲ Undoes newer Harness changes · 2");
    expect(plainText(undoesNewerLine("v1.4.0"))).toBe(
      "Deployed from release v1.4.0. Importing undoes newer Harness changes to this skill.",
    );
    expect(machineValues(undoesNewerLine("v1.4.0"))).toEqual(["v1.4.0"]);
  });

  it("heads a partial run with what landed of what was asked", () => {
    expect(importReportHeading(1, 2)).toBe("Imported 1 of 2 skills");
    expect(importReportHeading(0, 1)).toBe("Imported 0 of 1 skill");
  });

  it("names the refused group, an empty target and the landed skills' next step", () => {
    expect(cannotBeImportedLegend(2)).toBe("✕ Cannot be imported · 2");
    expect(NO_SKILL_QUALIFIES).toBe("no skill qualifies");
    expect(NO_LOCAL_EDITS).toBe("No local edits");
    expect(plainText(noLocalEditsLine("…/me/project"))).toBe(
      "No skill on …/me/project changed after deployment.",
    );
    expect(IMPORTED_NEXT_STEP).toBe(
      "Each is now a Pending proposal on the Harness screen. Select Propose change there.",
    );
  });

  it("states a failed check as nothing imported", () => {
    expect(localEditsCheckNotice(new HttpError(500, "x"))).toMatchObject({
      label: "Local edits not checked",
      message:
        "Nothing was imported. Select Close, then Import local edits again.",
    });
  });

  it.each([
    [
      "not-configured",
      "No Harness connected",
      "Select Change Harness location in Settings, then select Import local edits again.",
    ],
    [
      "repo-not-registered",
      "Repository not registered",
      "Register this repository in Maestro, then select Import local edits again.",
    ],
    [
      "unfinished-operation",
      "Change not finished",
      "An earlier change on this target did not finish. Finish it on the Deploy-state screen, then select Import local edits again.",
    ],
    [
      "target-unreadable",
      "Could not read deployment record",
      "Nothing was imported. Repair or delete apm.lock.yaml in the target, then select Import local edits again.",
    ],
    [
      "import-in-progress",
      "Harness already changing",
      "Wait for that change to finish, then select Import local edits again.",
    ],
  ] as const)(
    "names the %s block on check and on import",
    (code, label, message) => {
      const error = new HttpError(409, "x", code);
      expect(localEditsCheckNotice(error)).toMatchObject({ label, message });
      expect(localEditsImportNotice(error)).toMatchObject({ label, message });
    },
  );

  it("tells a refused run from an unanswered one", () => {
    expect(localEditsImportNotice(new HttpError(500, "x"))).toMatchObject({
      label: "Local edits not checked",
    });
    expect(localEditsImportNotice(new TypeError("fetch failed"))).toMatchObject(
      {
        label: "Import not confirmed",
        message:
          "The Maestro server did not answer, so some skills may have landed. Select Close, then check the Harness screen.",
      },
    );
  });
});
