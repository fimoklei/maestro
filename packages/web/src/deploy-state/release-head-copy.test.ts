import { describe, expect, it } from "vitest";
import {
  comparedLine,
  copyChipText,
  releaseLabel,
  releaseSentence,
} from "./release-head-copy";
import type { ReleaseHead } from "./use-deploy-state";

// The approved sentences, pinned as exact strings (copy.md).
const NOW = new Date("2026-09-12T10:00:00.000Z");

const head = (over: Partial<ReleaseHead> = {}): ReleaseHead => ({
  release: "v0.3.2",
  latestRelease: "v0.3.4",
  changed: 2,
  selected: 5,
  comparedAt: "2026-09-12T09:59:30.000Z",
  ...over,
});

describe("releaseLabel", () => {
  it("names the release the target follows", () => {
    expect(releaseLabel(head())).toBe("Release v0.3.2");
  });
});

describe("releaseSentence", () => {
  it("names the newer release and how much of the selection it changes", () => {
    expect(releaseSentence(head())).toBe(
      "Newer release v0.3.4: 2 of 5 skills changed",
    );
  });

  it("still names a release that changes nothing selected", () => {
    expect(releaseSentence(head({ changed: 0 }))).toBe(
      "Newer release v0.3.4: 0 of 5 skills changed",
    );
  });

  it("says the changes could not be read rather than counting them", () => {
    expect(releaseSentence(head({ changed: null }))).toBe(
      "Newer release v0.3.4. Changes could not be read.",
    );
  });

  it("says only that the changes could not be read when no newer release is known", () => {
    expect(releaseSentence(head({ latestRelease: null, changed: null }))).toBe(
      "Changes could not be read.",
    );
  });

  it("has no sentence for a target on the latest release", () => {
    expect(releaseSentence(head({ release: "v0.3.4", changed: 0 }))).toBeNull();
  });
});

describe("comparedLine", () => {
  it("says when the comparison was read", () => {
    expect(comparedLine(head(), NOW)).toBe(
      "Compared with the Harness, read just now",
    );
  });

  it("keeps an older read time rather than claiming it is current", () => {
    expect(
      comparedLine(head({ comparedAt: "2026-09-12T09:30:00.000Z" }), NOW),
    ).toBe("Compared with the Harness, read 30 min ago");
  });

  it("says so when no comparison has ever succeeded", () => {
    expect(comparedLine(head({ comparedAt: null }), NOW)).toBe(
      "Compared with the Harness, not read yet",
    );
  });

  it("says so when the read time is not a moment", () => {
    expect(comparedLine(head({ comparedAt: "yesterday" }), NOW)).toBe(
      "Compared with the Harness, not read yet",
    );
  });
});

describe("copyChipText", () => {
  it("names a copy that differs from its record", () => {
    expect(copyChipText("local-edits")).toStrictEqual({
      label: "Local edits",
      hint: "This copy differs from the release it was deployed from",
    });
  });

  it("names a copy with no record to check it against", () => {
    expect(copyChipText("unverified")).toStrictEqual({
      label: "Unverified",
      hint: "This copy could not be verified against a recorded baseline",
    });
  });
});
