import { describe, expect, it } from "vitest";
import {
  comparedLine,
  copyChipText,
  extraFilesLine,
  pinnedTagsLine,
  RELEASE_NOT_ADOPTED,
  releaseLabel,
  releaseSentence,
  unfinishedOperationNotice,
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

describe("pinnedTagsLine", () => {
  it("counts the skills a target still pins one at a time", () => {
    expect(pinnedTagsLine([{ release: "v0.3.1", skills: 3 }])).toBe(
      "3 skills at v0.3.1",
    );
  });

  it("names one skill as one", () => {
    expect(pinnedTagsLine([{ release: "v0.3.1", skills: 1 }])).toBe(
      "1 skill at v0.3.1",
    );
  });

  it("lists disagreeing tags after the biggest group", () => {
    expect(
      pinnedTagsLine([
        { release: "v0.3.1", skills: 3 },
        { release: "v0.3.0", skills: 1 },
      ]),
    ).toBe("3 skills at v0.3.1, 1 at v0.3.0");
  });
});

describe("RELEASE_NOT_ADOPTED", () => {
  it("names the way to one release in one meta line", () => {
    expect(RELEASE_NOT_ADOPTED).toBe(
      "Release not adopted. Select Remove skill for each, then Deploy skill.",
    );
  });
});

describe("extraFilesLine", () => {
  it("counts the deployed files that belong to no selected skill", () => {
    expect(extraFilesLine(2)).toBe(
      "Extra files deployed: 2 files outside the selected skills.",
    );
  });

  it("counts one file as one", () => {
    expect(extraFilesLine(1)).toBe(
      "Extra files deployed: 1 file outside the selected skills.",
    );
  });
});

describe("unfinishedOperationNotice", () => {
  it("names the release a retried deploy would install again", () => {
    expect(
      unfinishedOperationNotice({ kind: "deploy", release: "v0.3.4" }),
    ).toEqual({
      level: "warning",
      label: "Deploy incomplete",
      message:
        "Part of the selection is not on disk. Select Retry deploy to install release v0.3.4 again.",
    });
  });

  it("states an unfinished removal from what is still on disk", () => {
    expect(
      unfinishedOperationNotice({ kind: "remove", release: "v0.3.4" }),
    ).toEqual({
      level: "warning",
      label: "Removal incomplete",
      message:
        "The skill's files are still on disk. Select Retry removal to run the same removal again.",
    });
  });

  // Story 8: the half-landed Update states what landed, not just that it
  // stopped. The chip names the state; this sentence measures it.
  it("counts what a half-landed update landed", () => {
    expect(
      unfinishedOperationNotice(
        {
          kind: "update",
          release: "v0.3.4",
          desired: ["tdd", "grill", "jobs", "brief", "review"],
        },
        [
          { type: "skill", name: "tdd", version: "v0.3.4" },
          { type: "skill", name: "grill", version: "v0.3.4" },
          { type: "skill", name: "jobs", version: "v0.3.4" },
          { type: "skill", name: "brief", version: "v0.3.2" },
          { type: "skill", name: "review", version: "v0.3.2" },
        ],
      ),
    ).toEqual({
      level: "warning",
      label: "Update incomplete",
      message:
        "The update is incomplete. Select Retry update to run the same release again.",
      detail: "Update to v0.3.4 incomplete: 3 of 5 skills landed.",
    });
  });
});
