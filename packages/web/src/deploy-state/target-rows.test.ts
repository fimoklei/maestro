import { describe, expect, it } from "vitest";
import type { DriftViewModel } from "../drift/drift-view-model";
import { GLOBAL, REPOSITORIES } from "./deploy-state-copy";
import {
  globalRows,
  repoRow,
  statusSummary,
  type TargetRow,
} from "./target-rows";
import type { DeployedPrimitive, ReleaseHead } from "./use-deploy-state";

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

const skill = (
  name: string,
  copy?: DeployedPrimitive["copy"],
): DeployedPrimitive => ({
  type: "skill",
  name,
  version: "v0.3.4",
  ...(copy ? { copy } : {}),
});

const syncedDrift = {
  targetIndicator: () => "ok",
  forTool: () => syncedDrift,
} as unknown as DriftViewModel;

const words = (target: TargetRow) =>
  target.status && `${target.status.glyph} ${target.status.word}`;

describe("local edits on a target", () => {
  it("reads a repository holding an edited skill as Local edits", () => {
    const read = (primitives: DeployedPrimitive[]) => ({
      data: { primitives, skipped: [], releaseHead: ON_LATEST },
      isError: false,
    });
    const edited = [skill("tdd", "local-edits"), skill("grill")];
    expect(words(repoRow("/me/a", [], read(edited), syncedDrift))).toBe(
      "✎ Local edits",
    );
    expect(words(repoRow("/me/a", [], read([skill("tdd")]), syncedDrift))).toBe(
      "✓ In sync",
    );
    expect(
      words(
        repoRow("/me/a", [], read([skill("tdd", "unverified")]), syncedDrift),
      ),
    ).toBe("✓ In sync");
  });

  it("reads a failed read as Unknown, whatever its stale rows say", () => {
    const stale = {
      data: { primitives: [skill("tdd", "local-edits")], skipped: [] },
      isError: true,
    };
    const unknownDrift = {
      targetIndicator: () => "unknown",
    } as unknown as DriftViewModel;
    expect(words(repoRow("/me/a", [], stale, unknownDrift))).toBe("? Unknown");
    const rows = globalRows(
      {
        tools: [{ tool: "claude", primitives: [skill("tdd", "local-edits")] }],
        detectedTools: ["claude"],
        primitives: [],
        skipped: [],
        otherOrigins: [],
      },
      syncedDrift,
      true,
    );
    expect(rows.map(words)).toEqual(["? Unknown"]);
  });

  it("reads only the tool whose copy was edited as Local edits", () => {
    const tool = (name: string, primitives: DeployedPrimitive[]) => ({
      tool: name,
      primitives,
      releaseHead: ON_LATEST,
    });
    const rows = globalRows(
      {
        tools: [
          tool("claude", [skill("tdd", "local-edits")]),
          tool("codex", [skill("tdd")]),
        ],
        detectedTools: ["claude", "codex"],
        primitives: [],
        skipped: [],
        otherOrigins: [],
      },
      syncedDrift,
      false,
    );
    expect(rows.map(words)).toEqual(["✎ Local edits", "✓ In sync"]);
  });

  it("names the edited skills first in the Status card", () => {
    expect(
      statusSummary(
        row({
          head: ON_LATEST,
          primitives: [
            skill("tdd", "local-edits"),
            skill("grill"),
            skill("review", "local-edits"),
          ],
        }),
        NOW,
      ),
    ).toEqual([
      "2 skills have local edits: tdd and review.",
      "On the latest release.",
      "Compared with the Harness, read just now",
    ]);
  });
});
