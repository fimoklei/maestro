import { describe, expect, it } from "vitest";
import {
  COPY_READINGS,
  holdsEdits,
  isCopyReading,
  offersImport,
  readingsOn,
  withUnknown,
} from "./reading-order";

describe("reading order", () => {
  it("orders the target roll-up as GLOSSARY's Target roll-up row states", () => {
    expect(withUnknown(readingsOn("target"), "behind")).toEqual([
      "unfinished",
      "attention",
      "local-edits",
      "missing",
      "not-updated",
      "edits-in-harness",
      "behind",
      "unknown",
      "up-to-date",
      "pinned-per-skill",
      "other-origin",
      "empty",
    ]);
  });

  it("orders a skill row's mark, Unknown beside Unverified", () => {
    expect(withUnknown(readingsOn("skill"), "unverified")).toEqual([
      "local-edits",
      "missing",
      "not-updated",
      "unverified",
      "unknown",
      "no-longer-released",
      "edits-in-harness",
      "behind",
      "up-to-date",
    ]);
  });

  it("orders the Inventory row reading as GLOSSARY's row states", () => {
    expect(withUnknown(readingsOn("inventory"), "behind")).toEqual([
      "local-edits",
      "edits-in-harness",
      "behind",
      "unknown",
      "up-to-date",
      "not-deployed",
    ]);
  });

  it("orders a Global folder's deviations, a copy holding work first", () => {
    expect(readingsOn("folder")).toEqual([
      "local-edits",
      "missing",
      "not-updated",
    ]);
  });

  it("ranks Global's copy readings worst first", () => {
    expect(COPY_READINGS).toEqual([
      "local-edits",
      "unverified",
      "edits-in-harness",
    ]);
  });

  it("tells which readings a deployed copy carries", () => {
    expect(
      [
        "local-edits",
        "edits-in-harness",
        "unverified",
        "missing",
        "not-updated",
        "at-release",
        "unreadable",
      ].filter(isCopyReading),
    ).toEqual(["local-edits", "edits-in-harness", "unverified"]);
  });

  it("holds edits only where the copy's files are proven changed", () => {
    expect(COPY_READINGS.filter(holdsEdits)).toEqual([
      "local-edits",
      "edits-in-harness",
    ]);
  });

  it("offers an import only where the Working harness may lack the edits", () => {
    expect(COPY_READINGS.filter(offersImport)).toEqual([
      "local-edits",
      "unverified",
    ]);
  });
});
