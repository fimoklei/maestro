import type { ReportSkill } from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  type FolderReport,
  folderLines,
  heldLine,
  updatedToLine,
  writtenToLine,
} from "./written-to-copy";

const folder = (
  skills: ReportSkill[],
  options: Partial<FolderReport> = {},
): FolderReport => ({
  path: "~/.agents/skills",
  tool: "codex",
  detected: true,
  skills,
  ...options,
});

const written = (name: string): ReportSkill => ({ name, state: "written" });
const missing = (name: string): ReportSkill => ({ name, state: "missing" });

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

  it("counts a skill already at the release before the run as deployed, with no fold", () => {
    expect(
      writtenToLine(
        folder([
          written("tdd"),
          { name: "code-review", state: "already-at-release" },
        ]),
        true,
      ),
    ).toEqual({
      tone: "good",
      fact: "2 skills deployed",
      details: [],
      step: null,
    });
  });

  it("names a skill the run refused under Not written, never counting it as deployed", () => {
    expect(
      writtenToLine(
        folder([
          written("commit-message"),
          {
            name: "code-review",
            state: "refused",
            reason: "local-diverged-from-tag",
          },
        ]),
        false,
      ),
    ).toEqual({
      tone: "failed",
      fact: "1 of 2 skills deployed",
      details: [{ label: "Not written", value: "code-review" }],
      step: null,
    });
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
      step: "Retry the deploy to run it again.",
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

  it("asks to retry several deviating skills with the same step", () => {
    expect(
      writtenToLine(folder([missing("code-review"), missing("tdd")]), true)
        .step,
    ).toBe("Retry the deploy to run it again.");
  });

  it("names the release a not updated skill is still at, or none", () => {
    expect(
      writtenToLine(
        folder([
          written("tdd"),
          { name: "code-review", state: "not-updated", stillAt: "v1.1.0" },
          { name: "commit-message", state: "not-updated", stillAt: null },
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
      writtenToLine(folder([{ name: "tdd", state: "not-confirmed" }]), true),
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
        folder([written("tdd"), { name: "review", state: "not-confirmed" }]),
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
      writtenToLine(folder([], { detected: false, tool: "codex" }), true),
    ).toEqual({
      tone: "neutral",
      fact: "Codex not detected · not written",
      details: [],
      step: null,
    });
  });
});

describe("Written to line after Update target", () => {
  const notUpdated = (name: string, stillAt: string | null): ReportSkill => ({
    name,
    state: "not-updated",
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
      step: "Retry the update to run it again.",
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
      step: "Retry the update to run it again.",
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
        folder([{ name: "tdd", state: "not-confirmed" }]),
        update(true),
      ).fact,
    ).toBe("Not confirmed");
  });

  it("names the undetected tool of a folder the update skipped", () => {
    expect(
      updatedToLine(
        folder([], { detected: false, tool: "codex" }),
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
    expect(heldLine(2)).toEqual({
      tone: "neutral",
      fact: "0 of 2 skills deployed",
      details: [],
      step: null,
    });
    expect(heldLine(1).fact).toBe("0 of 1 skill deployed");
  });

  it("leaves out a former Claude Code folder, which no write reaches", () => {
    expect(
      folderLines(
        [
          { path: "~/.claude-work/skills", tool: "claude", detected: true },
          {
            path: "~/.claude/skills",
            tool: "claude",
            detected: false,
            former: true,
          },
        ],
        () => heldLine(2),
      ).map((line) => line.name),
    ).toEqual(["~/.claude-work/skills"]);
  });

  it("names the undetected tool of a folder Global does not write, muted", () => {
    expect(
      folderLines(
        [{ path: "~/.agents/skills", tool: "codex", detected: false }],
        () => heldLine(2),
      ),
    ).toEqual([
      {
        key: "~/.agents/skills",
        name: "~/.agents/skills",
        muted: true,
        tone: "neutral",
        fact: "Codex not detected · not written",
        details: [],
        step: null,
      },
    ]);
  });
});
