import type { ReleaseHead } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { machineValues, readNotice } from "../test-utils";
import { plainText } from "../ui/phrase";
import {
  behindLine,
  behindReason,
  changedFact,
  comparedFact,
  copyChipText,
  extraFilesFact,
  LATEST_RELEASE_UNKNOWN,
  ON_LATEST_RELEASE,
  pinnedTagsLine,
  RELEASE_NOT_ADOPTED,
  UNFINISHED_REASONS,
  unfinishedOperationNotice,
} from "./release-head-copy";

// The approved sentences, pinned as exact strings.
const NOW = new Date("2026-09-12T10:00:00.000Z");

const head = (over: Partial<ReleaseHead> = {}): ReleaseHead => ({
  release: "v0.3.2",
  latestRelease: "v0.3.4",
  changed: 2,
  selected: 5,
  comparedAt: "2026-09-12T09:59:30.000Z",
  ...over,
});

describe("behindReason", () => {
  it("counts the changed skills in the newer release", () => {
    expect(plainText(behindReason(head()))).toBe(
      "2 of 5 deployed skills changed in v0.3.4.",
    );
    expect(plainText(behindReason(head({ changed: 0 })))).toBe(
      "None of the 5 deployed skills changed in v0.3.4.",
    );
  });

  it("says the changes could not be read rather than counting them", () => {
    expect(plainText(behindReason(head({ changed: null })))).toBe(
      "Changes in v0.3.4 could not be read.",
    );
  });

  it("names another tool when this tool is already on the newer release", () => {
    expect(plainText(behindReason(head({ release: "v0.3.4" })))).toBe(
      "Another tool's skills are behind v0.3.4.",
    );
  });
});

describe("behindLine", () => {
  it("names the update control after the reason", () => {
    expect(plainText(behindLine(head(), "Update target"))).toBe(
      "2 of 5 deployed skills changed in v0.3.4. Select Update target to move this target to v0.3.4.",
    );
  });

  it("names no control while the latest release is unknown", () => {
    expect(
      plainText(behindLine(head({ latestRelease: null }), "Update target")),
    ).toBe("Latest release could not be read.");
  });
});

describe("behindReason without a latest release", () => {
  it("says the latest release could not be read", () => {
    expect(behindReason(head({ latestRelease: null }))).toBe(
      "Latest release could not be read.",
    );
  });
});

describe("UNFINISHED_REASONS", () => {
  it("states what an unfinished operation left, without its retry", () => {
    expect(UNFINISHED_REASONS).toEqual({
      deploy: "Part of the selection is not on disk.",
      remove: "The skill's files are still on disk.",
      update: "The update is incomplete.",
    });
  });
});

describe("copyChipText", () => {
  it("names a copy that differs from its record", () => {
    expect(copyChipText("local-edits")).toStrictEqual({
      label: "Local edits",
      hint: "Files changed after deployment.",
    });
  });

  it("names a copy with no record to check it against", () => {
    expect(copyChipText("unverified")).toStrictEqual({
      label: "Unverified",
      hint: "The deployment record cannot check this copy.",
    });
  });
});

describe("pinnedTagsLine", () => {
  it("counts the skills a target still pins one at a time", () => {
    expect(plainText(pinnedTagsLine([{ release: "v0.3.1", skills: 3 }]))).toBe(
      "3 skills at v0.3.1.",
    );
  });

  it("names one skill as one", () => {
    expect(plainText(pinnedTagsLine([{ release: "v0.3.1", skills: 1 }]))).toBe(
      "1 skill at v0.3.1.",
    );
  });

  it("lists disagreeing tags after the biggest group", () => {
    expect(
      plainText(
        pinnedTagsLine([
          { release: "v0.3.1", skills: 3 },
          { release: "v0.3.0", skills: 1 },
        ]),
      ),
    ).toBe("3 skills at v0.3.1, 1 at v0.3.0.");
  });
});

describe("RELEASE_NOT_ADOPTED", () => {
  it("names the way to one release in one meta line", () => {
    expect(RELEASE_NOT_ADOPTED).toBe(
      "Release not adopted. Select Remove skill for each, then select Deploy skill.",
    );
  });
});

describe("extraFilesFact", () => {
  it("counts the deployed files that belong to no selected skill", () => {
    expect(extraFilesFact(2)).toBe("2 files");
  });

  it("counts one file as one", () => {
    expect(extraFilesFact(1)).toBe("1 file");
  });
});

describe("changedFact", () => {
  it("counts the selected skills the newer release changed", () => {
    expect(changedFact(head())).toBe("2 of 5 skills");
  });

  // The Status hover card counts them; the pane names them (#1394).
  it("names the changed skills after the count", () => {
    expect(changedFact(head({ changedSkills: ["tdd", "grill"] }))).toBe(
      "2 of 5 skills: tdd and grill",
    );
  });

  it("still counts a newer release that changed none", () => {
    expect(changedFact(head({ changed: 0 }))).toBe("0 of 5 skills");
  });

  it("says the count could not be read, never a zero", () => {
    expect(changedFact(head({ changed: null }))).toBe("Could not be read");
    expect(changedFact(head({ latestRelease: null, changed: null }))).toBe(
      "Could not be read",
    );
  });

  it("states nothing on the latest release", () => {
    expect(changedFact(head({ release: "v0.3.4", changed: 0 }))).toBeNull();
  });
});

describe("comparedFact", () => {
  it("says when the comparison was read", () => {
    expect(comparedFact(head(), NOW)).toBe("Read just now");
    expect(
      comparedFact(head({ comparedAt: "2026-09-12T09:30:00.000Z" }), NOW),
    ).toBe("Read 30 min ago");
  });

  it("says so when no comparison has ever succeeded", () => {
    expect(comparedFact(head({ comparedAt: null }), NOW)).toBe("Not read yet");
  });

  it("says so when the read time is not a moment", () => {
    expect(comparedFact(head({ comparedAt: "yesterday" }), NOW)).toBe(
      "Not read yet",
    );
  });
});

describe("unfinishedOperationNotice", () => {
  it("names the release a retried deploy would install again", () => {
    expect(
      readNotice(
        unfinishedOperationNotice({ kind: "deploy", release: "v0.3.4" }),
      ),
    ).toEqual({
      level: "warning",
      label: "Deploy incomplete",
      message:
        "Part of the selection is not on disk. Select Retry deploy to deploy release v0.3.4 again.",
    });
  });

  it("states an unfinished removal from what is still on disk", () => {
    expect(
      readNotice(
        unfinishedOperationNotice({ kind: "remove", release: "v0.3.4" }),
      ),
    ).toEqual({
      level: "warning",
      label: "Removal incomplete",
      message:
        "The skill's files are still on disk. Select Retry removal to run the same removal again.",
    });
  });

  it("counts what a half-landed update landed", () => {
    expect(
      readNotice(
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
      ),
    ).toEqual({
      level: "warning",
      label: "Update incomplete",
      message:
        "The update is incomplete. Select Retry update to run the same release again.",
      detail:
        "Update to v0.3.4 incomplete: 3 of 5 skills now use this release.",
    });
  });
});

describe("a release in these sentences", () => {
  it("is set apart in the behind reason", () => {
    expect(machineValues(behindReason(head()))).toEqual(["v0.3.4"]);
    expect(machineValues(behindReason(head({ changed: null })))).toEqual([
      "v0.3.4",
    ]);
    expect(machineValues(behindReason(head({ release: "v0.3.4" })))).toEqual([
      "v0.3.4",
    ]);
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
    expect(
      machineValues(
        unfinishedOperationNotice({ kind: "deploy", release: "v0.3.4" })
          .message,
      ),
    ).toEqual(["v0.3.4"]);
    const update = unfinishedOperationNotice(
      { kind: "update", release: "v0.3.4", desired: ["tdd"] },
      [],
    );
    expect(machineValues(update.detail ?? "")).toEqual(["v0.3.4"]);
  });
});

describe("the hover card's release lines (#1125)", () => {
  it("states the latest release, or that it is unknown", () => {
    expect(ON_LATEST_RELEASE).toBe("On the latest release.");
    expect(LATEST_RELEASE_UNKNOWN).toBe("Latest release could not be read.");
  });
});
