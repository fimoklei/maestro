import type { PendingOperation, ReleaseHead } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { machineValues, unselectedControls } from "../test-utils";
import { plainText } from "../ui/phrase";
import * as releaseHeadCopy from "./release-head-copy";
import {
  behindLine,
  changedFact,
  comparedFact,
  extraFilesFact,
  pinnedTagsLine,
  UNFINISHED_REASONS,
  unfinishedOperationNotice,
} from "./release-head-copy";

// Contract tests: the words live once, in the copy module and the rendered
// tests of the Deploy-state row and pane. These prove the rules every sentence
// keeps, and the branches no rendered test reaches.
const NOW = new Date("2026-09-12T10:00:00.000Z");

const head = (over: Partial<ReleaseHead> = {}): ReleaseHead => ({
  release: "v0.3.2",
  latestRelease: "v0.3.4",
  changed: 2,
  selected: 5,
  comparedAt: "2026-09-12T09:59:30.000Z",
  ...over,
});

const KINDS: PendingOperation["kind"][] = ["deploy", "remove", "update"];

const unfinished = (kind: PendingOperation["kind"]) =>
  unfinishedOperationNotice({ kind, release: "v0.3.4", desired: ["tdd"] }, []);

describe("Release copy that names a control", () => {
  const sentences = Object.entries(releaseHeadCopy).flatMap(
    ([name, value]): [string, string][] =>
      typeof value === "string" ? [[name, value]] : [],
  );

  it.each(sentences)(
    "names every control in %s as select {Control}",
    (_name, text) => {
      expect(unselectedControls(text)).toEqual([]);
    },
  );
});

describe("behindLine", () => {
  const line = (over: Partial<ReleaseHead> = {}) =>
    plainText(behindLine(head(over), "Update target"));

  it("says a newer release changed none of the skills rather than counting zero", () => {
    expect(line({ changed: 0 })).not.toEqual(line());
    expect(line({ changed: 0 })).not.toMatch(/\b0 of\b/);
  });

  it("names no control while the latest release is unknown", () => {
    expect(line({ latestRelease: null })).not.toMatch(/Select/);
  });

  it("names Update target by the label the target's row gives it", () => {
    expect(plainText(behindLine(head(), "Update targets"))).toMatch(
      /Select Update targets to move this target/,
    );
  });
});

describe("an unfinished operation", () => {
  it.each(KINDS)("warns, opening on what the %s left", (kind) => {
    const notice = unfinished(kind);

    expect(notice.level).toBe("warning");
    expect(plainText(notice.message).startsWith(UNFINISHED_REASONS[kind])).toBe(
      true,
    );
  });

  // The hover card states the reason alone; the pane adds the retry.
  it("states what each operation left without its retry", () => {
    for (const kind of KINDS) {
      expect(UNFINISHED_REASONS[kind], kind).not.toMatch(/Select|Retry/);
    }
    expect(new Set(Object.values(UNFINISHED_REASONS)).size).toBe(KINDS.length);
  });
});

describe("the pane's facts", () => {
  it("counts one extra file as one", () => {
    expect(extraFilesFact(1)).toBe("1 file");
  });

  it("states no changed count on the latest release", () => {
    expect(changedFact(head({ release: "v0.3.4", changed: 0 }))).toBeNull();
  });

  it("says the count could not be read, never a zero, while the latest release is unknown", () => {
    expect(changedFact(head({ latestRelease: null, changed: null }))).toBe(
      changedFact(head({ changed: null })),
    );
  });

  it("reads a read time that is not a moment as never read", () => {
    expect(comparedFact(head({ comparedAt: "yesterday" }), NOW)).toBe(
      comparedFact(head({ comparedAt: null }), NOW),
    );
  });
});

describe("a release in these sentences", () => {
  it("is set apart in the behind line", () => {
    const values = (over: Partial<ReleaseHead>) =>
      machineValues(behindLine(head(over), "Update target"));
    const both = ["v0.3.4", "v0.3.4"];
    expect(values({})).toEqual(both);
    expect(values({ changed: null })).toEqual(both);
    expect(values({ release: "v0.3.4" })).toEqual(both);
  });

  it("is set apart in the pinned tags line", () => {
    expect(
      machineValues(
        pinnedTagsLine([
          { release: "v0.3.1", skills: 2 },
          { release: "v0.3.2", skills: 1 },
        ]),
      ),
    ).toEqual(["v0.3.1", "v0.3.2"]);
  });

  it("is set apart in an unfinished deploy and update", () => {
    expect(machineValues(unfinished("deploy").message)).toEqual(["v0.3.4"]);
    expect(machineValues(unfinished("update").detail ?? "")).toEqual([
      "v0.3.4",
    ]);
  });
});
