// The seeding self-check reads the cockpit through its own copy of this
// screen's derivation; this holds the copy to the screen.
import { describe, expect, it } from "vitest";
import {
  type CockpitRead,
  readCockpit,
} from "../../../../scripts/smoke-scenarios.mjs";
import { driftViewModel } from "../drift/drift-view-model";
import { unfinishedOperationNotice } from "./release-head-copy";
import { skillMark } from "./skill-mark";
import { repoRow, statusCard } from "./target-rows";

const REPO = "/sandbox/home/Projects/scenarios/behind";

const skill = (name: string, extra: Record<string, unknown> = {}) => ({
  type: "skill" as const,
  name,
  version: "v1.1.0",
  ...extra,
});

const head = (release: string, latestRelease: string) => ({
  release,
  latestRelease,
  changed: 1,
  selected: 3,
  comparedAt: null,
});

describe("readCockpit agrees with the Deploy-state screen", () => {
  const reads: [string, CockpitRead][] = [
    [
      "empty",
      { deployState: { primitives: [], skipped: [] }, drift: { behind: [] } },
    ],
    [
      "in sync",
      {
        deployState: {
          primitives: [skill("code-review")],
          skipped: [],
          releaseHead: head("v2.0.0", "v2.0.0"),
        },
        drift: { behind: [] },
      },
    ],
    [
      "behind",
      {
        deployState: {
          primitives: [skill("code-review"), skill("commit-message")],
          skipped: [],
          releaseHead: head("v1.1.0", "v2.0.0"),
        },
        drift: {
          behind: [
            {
              name: "code-review",
              latest: "v2.0.0",
              reading: "behind",
            },
          ],
        },
      },
    ],
    [
      "no longer released",
      {
        deployState: {
          primitives: [skill("release-notes")],
          skipped: [],
          releaseHead: head("v1.1.0", "v2.0.0"),
        },
        drift: {
          behind: [
            {
              name: "release-notes",
              latest: "v2.0.0",
              reading: "no-longer-released",
            },
          ],
        },
      },
    ],
    [
      "mixed releases",
      {
        deployState: {
          primitives: [skill("code-review")],
          skipped: [],
          releaseHead: head("v1.1.0", "v2.0.0"),
          pendingOperation: {
            kind: "update",
            release: "v2.0.0",
            desired: ["code-review"],
          },
        },
        drift: { behind: [] },
      },
    ],
    [
      "local edits",
      {
        deployState: {
          primitives: [skill("code-review", { copy: "local-edits" })],
          skipped: [],
          releaseHead: head("v2.0.0", "v2.0.0"),
        },
        drift: { behind: [] },
      },
    ],
    [
      "pinned per skill",
      {
        deployState: {
          primitives: [skill("code-review"), skill("commit-message")],
          skipped: [],
          pinnedPerSkill: [
            { release: "v1.1.0", skills: 1 },
            { release: "v1.0.0", skills: 1 },
          ],
        },
        drift: { behind: [] },
      },
    ],
    [
      "attention from a skipped entry",
      {
        deployState: {
          primitives: [skill("code-review", { copy: "local-edits" })],
          skipped: [{ reason: "invalid-package" }],
          releaseHead: head("v2.0.0", "v2.0.0"),
        },
        drift: { behind: [] },
      },
    ],
    [
      "local edits beside a skill no longer released",
      {
        deployState: {
          primitives: [
            skill("code-review", { copy: "local-edits" }),
            skill("release-notes"),
          ],
          skipped: [],
          releaseHead: head("v1.1.0", "v2.0.0"),
        },
        drift: {
          behind: [
            {
              name: "release-notes",
              latest: "v2.0.0",
              reading: "no-longer-released",
            },
          ],
        },
      },
    ],
    [
      "unverified copy",
      {
        deployState: {
          primitives: [
            skill("code-review", { copy: "unverified" }),
            skill("commit-message"),
          ],
          skipped: [],
          releaseHead: head("v2.0.0", "v2.0.0"),
        },
        drift: { behind: [] },
      },
    ],
    [
      "unfinished removal",
      {
        deployState: {
          primitives: [skill("code-review")],
          skipped: [],
          releaseHead: head("v2.0.0", "v2.0.0"),
          pendingOperation: { kind: "remove", release: "v2.0.0", desired: [] },
        },
        drift: { behind: [] },
      },
    ],
    [
      "unfinished deploy",
      {
        deployState: {
          primitives: [skill("code-review")],
          skipped: [],
          releaseHead: head("v2.0.0", "v2.0.0"),
          pendingOperation: {
            kind: "deploy",
            release: "v2.0.0",
            desired: ["code-review", "commit-message"],
          },
        },
        drift: { behind: [] },
      },
    ],
    [
      "unknown",
      {
        deployState: { primitives: [skill("code-review")], skipped: [] },
        drift: { ok: false },
      },
    ],
  ];

  it.each(reads)("%s", (_label, read) => {
    const drift = driftViewModel({ data: read.drift as never, isError: false });
    const row = repoRow(
      REPO,
      [REPO],
      { data: read.deployState as never, isError: false },
      drift,
    );
    const release = row.release
      ? row.release.latest && row.release.latest !== row.release.current
        ? `${row.release.current} → ${row.release.latest}`
        : row.release.current
      : null;

    expect(readCockpit(read)).toEqual({
      status: row.status?.word ?? null,
      release,
      notice: row.pending ? unfinishedOperationNotice(row.pending).label : null,
      skills: Object.fromEntries(
        row.primitives.map((primitive) => [
          primitive.name,
          skillMark(primitive.copy, drift.skillStatus(primitive.name))?.word,
        ]),
      ),
    });
  });

  it("refused read", () => {
    const row = repoRow(
      REPO,
      [REPO],
      { data: undefined, isError: true },
      driftViewModel({ data: undefined, isError: false }),
    );

    expect(
      readCockpit({ deployState: null, drift: { ok: false } }).status,
    ).toBe(statusCard(row, null).reason);
  });
});
