// The seeding self-check reads the cockpit through its own copy of this
// screen's derivation; this holds the copy to the screen.
import { describe, expect, it } from "vitest";
import {
  type CockpitRead,
  type GlobalCockpitRead,
  readCockpit,
  readGlobalCockpit,
} from "../../../../scripts/smoke-scenarios.mjs";
import { driftViewModel } from "../drift/drift-view-model";
import { folderMetaLine } from "./deploy-state-copy";
import { unfinishedOperationNotice } from "./release-head-copy";
import { skillMark } from "./skill-mark";
import { globalRows, repoRow, statusCard } from "./target-rows";
import { readByOf } from "./tool-presentation";
import { globalDeployStateQueryOptions } from "./use-global-deploy-state";

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
      "pinned per skill, local edits beside a skill no longer released",
      {
        deployState: {
          primitives: [
            skill("code-review", { copy: "local-edits" }),
            skill("release-notes"),
          ],
          skipped: [],
          pinnedPerSkill: [{ release: "v1.1.0", skills: 2 }],
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
      { path: REPO, status: "ready" },
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
      { path: REPO, status: "ready" },
      [REPO],
      { data: undefined, isError: true },
      driftViewModel({ data: undefined, isError: false }),
    );

    expect(
      readCockpit({ deployState: null, drift: { ok: false } }).status,
    ).toBe(statusCard(row, null).reason);
  });
});

describe("readGlobalCockpit agrees with the Deploy-state screen", () => {
  const CLAUDE = "~/.claude/skills";
  const AGENTS = "~/.agents/skills";
  type Folder = GlobalCockpitRead["deployState"]["folders"][number];
  const folder = (
    path: string,
    tool: Folder["tool"],
    primitives: Folder["primitives"],
    extra: Partial<Folder> = {},
  ): Folder => ({ path, tool, detected: true, primitives, ...extra });
  const global = (
    folders: Folder[],
    extra: Partial<GlobalCockpitRead["deployState"]> = {},
  ): GlobalCockpitRead["deployState"] => ({
    primitives: folders.flatMap((each) => each.primitives),
    folders,
    skipped: [],
    otherOrigins: [],
    releaseHead: head("v1.1.0", "v2.0.0"),
    ...extra,
  });
  const edited = skill("code-review", { copy: "local-edits" });

  const reads: [string, GlobalCockpitRead][] = [
    [
      "the global-folders scenario",
      {
        deployState: global(
          [
            folder(
              CLAUDE,
              "claude",
              [edited, skill("commit-message"), skill("release-notes")],
              {
                notUpdated: {
                  targetRelease: "v1.1.0",
                  copies: [{ name: "commit-message", stillAt: "v1.0.0" }],
                },
              },
            ),
            folder(AGENTS, "codex", [edited, skill("commit-message")], {
              missing: ["release-notes"],
            }),
          ],
          {
            primitives: [
              edited,
              skill("commit-message"),
              skill("release-notes"),
            ],
          },
        ),
        drift: {
          behind: [
            { name: "code-review", reading: "behind" },
            { name: "release-notes", reading: "no-longer-released" },
          ],
        },
      },
    ],
    [
      "behind with clean folders",
      {
        deployState: global([
          folder(CLAUDE, "claude", [skill("commit-message")]),
          folder(AGENTS, "codex", [skill("commit-message")]),
        ]),
        drift: { behind: [] },
      },
    ],
    [
      "in sync",
      {
        deployState: global(
          [folder(CLAUDE, "claude", [skill("code-review")])],
          { releaseHead: head("v2.0.0", "v2.0.0") },
        ),
        drift: { behind: [] },
      },
    ],
    [
      "one folder missing a skill, the other not updated",
      {
        deployState: global([
          folder(CLAUDE, "claude", [skill("code-review")], {
            notUpdated: {
              targetRelease: "v1.1.0",
              copies: [{ name: "code-review", stillAt: null }],
            },
          }),
          folder(AGENTS, "codex", [], { missing: ["code-review"] }),
        ]),
        drift: { behind: [] },
      },
    ],
    [
      "a stray copy in an undetected folder that differs",
      {
        deployState: global(
          [
            folder(CLAUDE, "claude", [skill("code-review")]),
            folder(AGENTS, "codex", [], {
              detected: false,
              strayCopies: [{ name: "code-review", atRelease: false }],
            }),
          ],
          { releaseHead: head("v2.0.0", "v2.0.0") },
        ),
        drift: { behind: [] },
      },
    ],
    [
      "an unfinished update",
      {
        deployState: global([folder(CLAUDE, "claude", [edited])], {
          pendingOperation: {
            kind: "update",
            release: "v2.0.0",
            desired: ["code-review"],
          },
        }),
        drift: { behind: [] },
      },
    ],
    [
      "local edits beside a skipped entry",
      {
        deployState: global([folder(CLAUDE, "claude", [edited])], {
          skipped: [{ reason: "invalid-package" }],
        }),
        drift: { behind: [] },
      },
    ],
    [
      "only another origin's skills",
      {
        deployState: global([folder(CLAUDE, "claude", [])], {
          otherOrigins: ["acme/other-harness"],
        }),
        drift: { behind: [] },
      },
    ],
    [
      "unknown",
      {
        deployState: global([folder(CLAUDE, "claude", [skill("code-review")])]),
        drift: { ok: false },
      },
    ],
  ];

  it.each(reads)("%s", (_label, read) => {
    const drift = driftViewModel({ data: read.drift as never, isError: false });
    const data = globalDeployStateQueryOptions().select(
      read.deployState as never,
    );
    const [row] = globalRows(data, drift, false);
    if (row === undefined) throw new Error("no Global row");
    const reading = readGlobalCockpit(read);

    expect(reading.status).toBe(row.status?.word ?? null);
    expect(reading.release).toBe(
      row.release?.latest && row.release.latest !== row.release.current
        ? `${row.release.current} → ${row.release.latest}`
        : (row.release?.current ?? null),
    );
    expect(reading.notice).toBe(
      row.pending ? unfinishedOperationNotice(row.pending).label : null,
    );
    const written = (row.folders ?? []).filter((each) => each.detected);
    expect(Object.keys(reading.folders)).toEqual(
      written.map((each) => each.path),
    );
    for (const each of written) {
      const shown = reading.folders[each.path];
      const tool = data.folders.find((one) => one.path === each.path)?.tool;
      if (shown === undefined || tool === undefined)
        throw new Error(`no reading for ${each.path}`);
      expect(shown.word).toBe(each.word?.word ?? null);
      expect(folderMetaLine(readByOf(tool), shown.counts)).toBe(each.meta);
    }
  });
});
