import type { FolderOutcome, SkillOutcome } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { writtenToLine } from "./written-to-copy";

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
      fact: "2 skills written",
      details: [],
      step: null,
    });
    expect(writtenToLine(folder([written("tdd")]), true).fact).toBe(
      "1 skill written",
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
      step: "Select Retry deploy to write it again.",
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
    ).toBe("Select Retry deploy to write them again.");
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
      fact: "1 of 3 skills written",
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
      fact: "1 of 2 skills written",
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
