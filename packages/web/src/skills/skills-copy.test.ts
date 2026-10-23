import { describe, expect, it } from "vitest";
import { machineValues, unselectedControls } from "../test-utils";
import { plainText } from "../ui/phrase";
import * as skillsCopy from "./skills-copy";
import {
  globalOptionLabel,
  NO_TARGET_CHOSEN,
  skillStateLine,
  TARGETS_LOADING,
} from "./skills-copy";

// Contract tests: the words live once, in the copy module and the rendered
// tests of the Skills screen, its pane and its bulk dialogs. These prove the
// rules every sentence keeps, and the branches no rendered test reaches.

describe("the bulk Deploy cause lines", () => {
  it("keeps the approved sentences", () => {
    expect(TARGETS_LOADING).toBe("Loading targets…");
    expect(NO_TARGET_CHOSEN).toBe("Choose a target.");
  });
});

describe("globalOptionLabel", () => {
  it("names both detected tools", () => {
    expect(globalOptionLabel(["claude", "codex"])).toBe(
      "Global (Claude Code + Codex)",
    );
  });

  it("falls back to plain Global while the tool set is unknown", () => {
    // Loading or unreadable: never claim a tool set we cannot prove.
    expect(globalOptionLabel(undefined)).toBe("Global");
  });
});

// The skill detail pane's state sentence (#1435).
describe("skillStateLine", () => {
  const line = (state: Parameters<typeof skillStateLine>[0]) =>
    plainText(skillStateLine(state));
  const behind = {
    kind: "behind" as const,
    count: 2,
    total: 3,
    from: "v1.3.2",
    to: "v1.4.0",
    updatable: true,
  };

  it("agrees the verb with the count of edited copies", () => {
    expect(line({ kind: "local-edits", count: 2, total: 2 })).toMatch(
      /^2 of 2 targets have local edits\./,
    );
  });

  it("speaks of one behind target as it", () => {
    expect(line({ ...behind, count: 1, total: 1 })).toMatch(
      /^1 of 1 target follows v1\.3\.2\. .* move it to v1\.4\.0\.$/,
    );
  });

  it("says an older release where the behind targets follow different ones", () => {
    const sentence = skillStateLine({ ...behind, from: null });

    expect(plainText(sentence)).toMatch(/follow an older release\./);
    expect(machineValues(sentence)).toEqual(["v1.4.0"]);
  });

  it("names the latest release in words while its tag is not read", () => {
    const sentence = skillStateLine({ ...behind, to: null });

    expect(plainText(sentence)).toMatch(/to the latest release\.$/);
    expect(machineValues(sentence)).toEqual(["v1.3.2"]);
  });

  it("names Re-read Skills where a check could not answer", () => {
    expect(line({ kind: "unknown" })).toMatch(/Select Re-read Skills/);
  });

  it("names every control it points to as select {Control}", () => {
    for (const state of [
      { kind: "local-edits", count: 1, total: 3 },
      behind,
      { kind: "unknown" },
      { kind: "up-to-date" },
    ] as const) {
      expect(unselectedControls(skillStateLine(state)), state.kind).toEqual([]);
    }
  });
});

describe("Skills copy that names a control", () => {
  const sentences: [string, string][] = [];
  for (const [name, value] of Object.entries(skillsCopy)) {
    if (typeof value === "string") sentences.push([name, value]);
    else if (typeof value === "object")
      for (const [field, text] of Object.entries(value))
        if (typeof text === "string")
          sentences.push([`${name}.${field}`, text]);
  }

  it.each(sentences)(
    "names every control in %s as select {Control}",
    (_name, text) => {
      expect(unselectedControls(text)).toEqual([]);
    },
  );
});
