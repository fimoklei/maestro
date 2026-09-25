import { describe, expect, it } from "vitest";
import type { DriftViewModel } from "../drift/drift-view-model";
import { GLOBAL, REPOSITORIES } from "./deploy-state-copy";
import { statusSummary, type TargetRow } from "./target-rows";
import type { ReleaseHead } from "./use-deploy-state";

const NOW = new Date("2026-09-24T10:00:00Z");

const ON_LATEST: ReleaseHead = {
  release: "v0.3.4",
  latestRelease: "v0.3.4",
  changed: 0,
  changedSkills: [],
  selection: ["tdd"],
  selected: 1,
  comparedAt: "2026-09-24T10:00:00Z",
};

const row = (facts: Partial<TargetRow>): TargetRow => ({
  id: "repo:/me/a",
  group: REPOSITORIES,
  name: "a",
  path: "/me/a",
  target: { kind: "repo", repoPath: "/me/a" },
  wire: { kind: "repo", repoPath: "/me/a" },
  updateName: "a",
  release: null,
  status: null,
  skills: 1,
  primitives: [],
  drift: {} as DriftViewModel,
  skipped: [],
  otherOrigins: [],
  readFailed: false,
  behind: false,
  ...facts,
});

// #1125: the card says why the ⋮ menu offers no update or retry, and names
// the follow-up where one exists.
describe("statusSummary", () => {
  it("states that a target on the latest release is on it", () => {
    expect(statusSummary(row({ head: ON_LATEST }), NOW)).toEqual([
      "On the latest release.",
      "Compared with the Harness, read just now",
    ]);
  });

  it("names Update target as the next step on a behind target", () => {
    const head = { ...ON_LATEST, release: "v0.3.2", changed: 1, selected: 3 };
    expect(statusSummary(row({ head, behind: true }), NOW)).toEqual([
      "Newer release v0.3.4: 1 of 3 skills changed",
      "Select Update target to use release v0.3.4.",
      "Compared with the Harness, read just now",
    ]);
  });

  it("states that the latest release could not be read", () => {
    expect(
      statusSummary(row({ head: { ...ON_LATEST, latestRelease: null } }), NOW),
    ).toEqual([
      "Latest release could not be read.",
      "Compared with the Harness, read just now",
    ]);
  });

  it("names the way out of a target pinned per skill", () => {
    expect(
      statusSummary(
        row({
          pinned: [
            { release: "v0.3.1", skills: 2 },
            { release: "v0.3.0", skills: 1 },
          ],
        }),
        NOW,
      ),
    ).toEqual([
      "2 skills at v0.3.1, 1 at v0.3.0",
      "Release not adopted. Select Remove skill for each, then Deploy skill.",
    ]);
  });

  it("names the retry of an unfinished operation, and claims no release", () => {
    expect(
      statusSummary(
        row({
          head: ON_LATEST,
          pending: { kind: "deploy", release: "v0.3.4", desired: ["tdd"] },
        }),
        NOW,
      ),
    ).toEqual([
      "Deploy incomplete",
      "Part of the selection is not on disk. Select Retry deploy to install release v0.3.4 again.",
      "Compared with the Harness, read just now",
    ]);
  });

  // A tool on the latest release is still behind when a sibling tool is: one
  // Update target moves every detected tool (#951).
  it("claims no latest release on a tool whose global target is behind", () => {
    expect(
      statusSummary(row({ group: GLOBAL, head: ON_LATEST, behind: true }), NOW),
    ).toEqual([
      "Select Update target to use release v0.3.4.",
      "Compared with the Harness, read just now",
    ]);
  });

  it("claims no latest release from a read that failed", () => {
    expect(
      statusSummary(
        row({ group: GLOBAL, head: ON_LATEST, readFailed: true }),
        NOW,
      ),
    ).toEqual(["Compared with the Harness, read just now"]);
  });
});
