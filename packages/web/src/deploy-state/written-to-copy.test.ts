import type { FolderOutcome, SkillOutcome } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { heldLine, updatedToLine, writtenToLine } from "./written-to-copy";

const folder = (
  skills: SkillOutcome[],
  options: Partial<FolderOutcome> = {},
): FolderOutcome => ({
  path: "~/.agents/skills",
  tool: "codex",
  written: true,
  skills,
  ...options,
});

const written = (name: string): SkillOutcome => ({ name, outcome: "written" });
const missing = (name: string): SkillOutcome => ({ name, outcome: "missing" });

// Approved strings, as exact strings.
describe("Written to line", () => {
  it("counts the skills a clean folder got, with no fold", () => {
    expect(
      writtenToLine(folder([written("code-review"), written("tdd")]), true),
    ).toEqual({
      tone: "good",
      fact: "2 skills deployed",
      details: [],
      step: null,
    });
    expect(writtenToLine(folder([written("tdd")]), true).fact).toBe(
      "1 skill deployed",
    );
  });

  it("counts the missing skills and names each under Missing", () => {
    expect(
      writtenToLine(
        folder([written("code-review"), missing("commit-message")]),
        true,
      ),
    ).toEqual({
      tone: "failed",
      fact: "1 of 2 skills missing",
      details: [{ label: "Missing", value: "commit-message" }],
      step: "Select Retry deploy to deploy it again.",
    });
  });

  it("counts a folder that got none of its skills without a fraction", () => {
    expect(writtenToLine(folder([missing("tdd")]), true).fact).toBe(
      "1 skill missing",
    );
    expect(
      writtenToLine(folder([missing("tdd"), missing("review")]), true).fact,
    ).toBe("2 skills missing");
  });

  it("asks to write several deviating skills again as them", () => {
    expect(
      writtenToLine(folder([missing("code-review"), missing("tdd")]), true)
        .step,
    ).toBe("Select Retry deploy to deploy them again.");
  });

  it("names the release a not updated skill is still at, or none", () => {
    expect(
      writtenToLine(
        folder([
          written("tdd"),
          { name: "code-review", outcome: "not-updated", stillAt: "v1.1.0" },
          { name: "commit-message", outcome: "not-updated", stillAt: null },
        ]),
        false,
      ),
    ).toEqual({
      tone: "failed",
      fact: "1 of 3 skills deployed",
      details: [
        { label: "Not updated", value: "code-review · still at v1.1.0" },
        { label: "Not updated", value: "commit-message" },
      ],
      step: null,
    });
  });

  it("reads a folder nothing could confirm as Not confirmed, with no fold", () => {
    expect(
      writtenToLine(folder([{ name: "tdd", outcome: "not-confirmed" }]), true),
    ).toEqual({
      tone: "unknown",
      fact: "Not confirmed",
      details: [],
      step: null,
    });
  });

  it("names a skill it could not confirm beside written ones", () => {
    expect(
      writtenToLine(
        folder([written("tdd"), { name: "review", outcome: "not-confirmed" }]),
        false,
      ),
    ).toEqual({
      tone: "unknown",
      fact: "1 of 2 skills deployed",
      details: [{ label: "Not confirmed", value: "review" }],
      step: null,
    });
  });

  it("names the undetected tool of a folder the deploy skipped", () => {
    expect(
      writtenToLine(folder([], { written: false, tool: "codex" }), true),
    ).toEqual({
      tone: "neutral",
      fact: "Codex not detected · not written",
      details: [],
      step: null,
    });
  });
});

describe("Written to line after Update target", () => {
  const notUpdated = (name: string, stillAt: string | null): SkillOutcome => ({
    name,
    outcome: "not-updated",
    stillAt,
  });
  const update = (retry: boolean) => ({ release: "v2.0.0", retry });

  it("states the release a clean folder is at, with no fold", () => {
    expect(
      updatedToLine(
        folder([written("code-review"), written("tdd")]),
        update(false),
      ),
    ).toEqual({
      tone: "good",
      fact: "At v2.0.0",
      details: [],
      step: null,
    });
  });

  it("counts the skills not updated and names the release each is still at", () => {
    expect(
      updatedToLine(
        folder([written("tdd"), notUpdated("code-review", "v1.1.0")]),
        update(true),
      ),
    ).toEqual({
      tone: "failed",
      fact: "1 skill not updated",
      details: [
        { label: "Not updated", value: "code-review · still at v1.1.0" },
      ],
      step: "Select Retry update to run the same release again.",
    });
    expect(
      updatedToLine(
        folder([notUpdated("code-review", null), notUpdated("tdd", "v1.0.0")]),
        update(false),
      ),
    ).toEqual({
      tone: "failed",
      fact: "2 skills not updated",
      details: [
        { label: "Not updated", value: "code-review" },
        { label: "Not updated", value: "tdd · still at v1.0.0" },
      ],
      step: null,
    });
  });

  it("uses Deploy's words for a missing skill", () => {
    expect(
      updatedToLine(
        folder([written("code-review"), missing("commit-message")]),
        update(true),
      ),
    ).toEqual({
      tone: "failed",
      fact: "1 of 2 skills missing",
      details: [{ label: "Missing", value: "commit-message" }],
      step: "Select Retry update to run the same release again.",
    });
  });

  it("counts the skills deployed where the folder's outcomes are mixed", () => {
    expect(
      updatedToLine(
        folder([
          written("tdd"),
          missing("review"),
          notUpdated("code-review", "v1.1.0"),
        ]),
        update(false),
      ).fact,
    ).toBe("1 of 3 skills deployed");
  });

  it("reads a folder nothing could confirm as Not confirmed", () => {
    expect(
      updatedToLine(
        folder([{ name: "tdd", outcome: "not-confirmed" }]),
        update(true),
      ).fact,
    ).toBe("Not confirmed");
  });

  it("names the undetected tool of a folder the update skipped", () => {
    expect(
      updatedToLine(
        folder([], { written: false, tool: "codex" }),
        update(true),
      ),
    ).toEqual({
      tone: "neutral",
      fact: "Codex not detected · not written",
      details: [],
      step: null,
    });
  });
});

describe("Written to line of a held deploy", () => {
  it("states that the folder got none of the held skills", () => {
    expect(heldLine({ tool: "claude", detected: true }, 2)).toEqual({
      tone: "neutral",
      fact: "0 of 2 skills deployed",
      details: [],
      step: null,
    });
    expect(heldLine({ tool: "claude", detected: true }, 1).fact).toBe(
      "0 of 1 skill deployed",
    );
  });

  it("names the undetected tool of a folder Global does not write", () => {
    expect(heldLine({ tool: "codex", detected: false }, 2).fact).toBe(
      "Codex not detected · not written",
    );
  });
});
