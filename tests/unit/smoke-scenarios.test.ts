import type { HarnessChange } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { recordHashes } from "../../scripts/smoke-copies.mjs";
import { noToolsMismatch } from "../../scripts/smoke-no-tools.mjs";
import {
  type HarnessRead,
  type HarnessReadRow,
  harnessMismatch,
  harnessOfflineMismatch,
  parseReleaseArg,
  parseScenarioArg,
  readCockpit,
  readGlobalCockpit,
  releaseMirrorProblem,
  SCENARIO_CATALOG,
  SCENARIO_NAMES,
  scenarioMismatch,
  unprefixedHashes,
} from "../../scripts/smoke-scenarios.mjs";

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

describe("parseScenarioArg", () => {
  it("returns null when no scenario is asked for", () => {
    expect(parseScenarioArg(["--check"])).toBeNull();
  });

  it("reads a comma list in the order given", () => {
    expect(parseScenarioArg(["--scenario", "local-edits,behind"])).toEqual([
      "local-edits",
      "behind",
    ]);
  });

  it("expands all to every scenario", () => {
    expect(parseScenarioArg(["--scenario", "all"])).toEqual(SCENARIO_NAMES);
    expect(SCENARIO_NAMES).toHaveLength(16);
    expect(SCENARIO_NAMES).toEqual(
      expect.arrayContaining([
        "edits-in-harness",
        "harness-outcomes",
        "import-edits",
        "deploy-again",
        "unreadable",
        "harness-offline",
        "global-folders",
        "no-tools",
      ]),
    );
  });

  it("refuses an unknown name and lists the valid ones", () => {
    expect(() => parseScenarioArg(["--scenario", "behnd"])).toThrow(
      /unknown scenario "behnd".*empty, in-sync, behind/,
    );
  });

  it("refuses the flag without a value", () => {
    expect(() => parseScenarioArg(["--scenario"])).toThrow(/names a scenario/);
  });
});

describe("SCENARIO_CATALOG", () => {
  it("gives every scenario one line saying what it seeds", () => {
    expect(SCENARIO_CATALOG.map(({ name }) => name)).toEqual(SCENARIO_NAMES);
    for (const { name, summary } of SCENARIO_CATALOG) {
      expect(summary, name).toMatch(/^\S.*\S$/);
      expect(summary, name).not.toContain("\n");
    }
  });
});

describe("parseReleaseArg", () => {
  it("returns null when no release is asked for", () => {
    expect(parseReleaseArg(["--scenario", "behind"])).toBeNull();
  });

  it("reads the fixture release to publish", () => {
    expect(parseReleaseArg(["--release", "v1.1.0"])).toBe("v1.1.0");
  });

  it("refuses an unknown release and lists the valid ones", () => {
    expect(() => parseReleaseArg(["--release", "v3.0.0"])).toThrow(
      /unknown fixture release "v3.0.0"; valid: v1.0.0, v1.1.0, v2.0.0/,
    );
  });

  it("refuses the flag without a value", () => {
    expect(() => parseReleaseArg(["--release"])).toThrow(
      /--release names a fixture release: v1.0.0, v1.1.0, v2.0.0/,
    );
  });
});

describe("scenarioMismatch", () => {
  it("names the scenario, the repo, and the expected and actual reading", () => {
    const observed = readCockpit({
      deployState: {
        primitives: [skill("code-review")],
        skipped: [],
        releaseHead: head("v1.1.0", "v1.1.0"),
      },
      drift: { behind: [] },
    });

    const message = scenarioMismatch(
      { name: "behind", expect: { status: "Behind" } },
      REPO,
      observed,
    );

    expect(message).toBe(
      `scenario "behind" (${REPO}): status expected "Behind", got "In sync"`,
    );
  });

  it("passes when every declared fact matches", () => {
    const observed = readCockpit({
      deployState: {
        primitives: [skill("code-review", { copy: "unverified" })],
        skipped: [],
        releaseHead: head("v2.0.0", "v2.0.0"),
      },
      drift: { behind: [] },
    });

    expect(
      scenarioMismatch(
        {
          name: "unverified",
          expect: {
            status: "In sync",
            skills: { "code-review": "Unverified" },
          },
        },
        REPO,
        observed,
      ),
    ).toBeNull();
  });

  it("names a release pair the cockpit does not show", () => {
    const observed = readCockpit({
      deployState: {
        primitives: [skill("code-review")],
        skipped: [],
        releaseHead: head("v1.0.0", "v2.0.0"),
      },
      drift: { behind: [] },
    });

    expect(
      scenarioMismatch(
        { name: "behind", expect: { release: "v1.1.0 → v2.0.0" } },
        REPO,
        observed,
      ),
    ).toMatch(/release expected "v1.1.0 → v2.0.0", got "v1.0.0 → v2.0.0"/);
  });

  it("names a notice the cockpit does not show", () => {
    const observed = readCockpit({
      deployState: { primitives: [skill("code-review")], skipped: [] },
      drift: { behind: [] },
    });

    expect(
      scenarioMismatch(
        {
          name: "unfinished-operation",
          expect: { notice: "Deploy incomplete" },
        },
        REPO,
        observed,
      ),
    ).toMatch(/notice expected "Deploy incomplete", got none/);
  });

  it("reads a copy the Harness holds as Edits in the Harness, below Local edits", () => {
    const read = (primitives: ReturnType<typeof skill>[]) =>
      readCockpit({
        deployState: {
          primitives,
          skipped: [],
          releaseHead: head("v2.0.0", "v2.0.0"),
        },
        drift: { behind: [] },
      });

    expect(
      read([skill("test-plan", { copy: "edits-in-harness" })]),
    ).toMatchObject({
      status: "Edits in the Harness",
      skills: { "test-plan": "Edits in the Harness" },
    });
    expect(
      read([
        skill("test-plan", { copy: "edits-in-harness" }),
        skill("code-review", { copy: "local-edits" }),
      ]).status,
    ).toBe("Local edits");
  });

  it("reads a refused deploy-state as the screen's failure notice", () => {
    const observed = readCockpit({ deployState: null, drift: { ok: false } });

    expect(
      scenarioMismatch(
        {
          name: "unreadable",
          expect: { status: "Couldn't read this repository's deploy-state." },
        },
        REPO,
        observed,
      ),
    ).toBeNull();
  });

  it("names a skill the Import local edits dialog groups elsewhere", () => {
    const observed = readCockpit({
      deployState: {
        primitives: [
          skill("code-review", { copy: "local-edits" }),
          skill("commit-message", { copy: "local-edits" }),
        ],
        skipped: [],
      },
      drift: { behind: [] },
      localEdits: [
        { name: "code-review", refusal: "deployed-copy" },
        { name: "commit-message", refusal: null },
      ],
    });

    expect(
      scenarioMismatch(
        {
          name: "import-edits",
          expect: {
            imports: {
              "code-review": "Undoes newer Harness changes",
              "commit-message": "Can be imported",
            },
          },
        },
        REPO,
        observed,
      ),
    ).toBe(
      `scenario "import-edits" (${REPO}): Import local edits groups code-review under "Cannot be imported", expected "Undoes newer Harness changes"`,
    );
  });

  it("passes when the dialog groups each skill as declared", () => {
    const observed = readCockpit({
      deployState: { primitives: [], skipped: [] },
      drift: { behind: [] },
      localEdits: [
        { name: "code-review", refusal: null, undoesNewerSince: "v1.1.0" },
        { name: "commit-message", refusal: null },
      ],
    });

    expect(
      scenarioMismatch(
        {
          name: "import-edits",
          expect: {
            imports: {
              "code-review": "Undoes newer Harness changes",
              "commit-message": "Can be imported",
            },
          },
        },
        REPO,
        observed,
      ),
    ).toBeNull();
  });
});

describe("readGlobalCockpit", () => {
  const CLAUDE = "~/.claude/skills";
  const AGENTS = "~/.agents/skills";
  const folder = (
    path: string,
    tool: "claude" | "codex",
    primitives: ReturnType<typeof skill>[],
    extra: Record<string, unknown> = {},
  ) => ({ path, tool, detected: true, primitives, ...extra });

  it("reads each Global folder's word and counts, and Global as its worst folder", () => {
    const reading = readGlobalCockpit({
      deployState: {
        primitives: [
          skill("code-review", { copy: "local-edits" }),
          skill("commit-message"),
          skill("release-notes"),
        ],
        folders: [
          folder(
            CLAUDE,
            "claude",
            [
              skill("code-review", { copy: "local-edits" }),
              skill("commit-message"),
              skill("release-notes"),
            ],
            {
              notUpdated: {
                targetRelease: "v1.1.0",
                copies: [{ name: "commit-message", stillAt: "v1.0.0" }],
              },
            },
          ),
          folder(
            AGENTS,
            "codex",
            [
              skill("code-review", { copy: "local-edits" }),
              skill("commit-message"),
            ],
            { missing: ["release-notes"] },
          ),
        ],
        skipped: [],
        otherOrigins: [],
        releaseHead: head("v1.1.0", "v2.0.0"),
      },
      drift: {
        behind: [
          { name: "code-review", reading: "behind" },
          { name: "release-notes", reading: "no-longer-released" },
        ],
      },
    });

    expect(reading).toEqual({
      status: "Local edits",
      release: "v1.1.0 → v2.0.0",
      notice: null,
      skills: {},
      folders: {
        [CLAUDE]: {
          word: "Local edits",
          counts: { missing: 0, notUpdated: 1, localEdits: 1 },
        },
        [AGENTS]: {
          word: "Local edits",
          counts: { missing: 1, notUpdated: 0, localEdits: 1 },
        },
      },
    });
  });

  it("reads a folder whose copies match the release as Up to date, also while Global is behind", () => {
    const reading = readGlobalCockpit({
      deployState: {
        primitives: [skill("commit-message")],
        folders: [
          folder(CLAUDE, "claude", [skill("commit-message")]),
          folder(AGENTS, "codex", [skill("commit-message")], {
            missing: [],
          }),
          {
            path: "~/.config/x/skills",
            tool: "claude",
            detected: false,
            primitives: [],
          },
        ],
        skipped: [],
        otherOrigins: [],
        releaseHead: head("v1.1.0", "v2.0.0"),
      },
      drift: { behind: [] },
    });

    expect(reading.status).toBe("Behind");
    expect(Object.keys(reading.folders ?? {})).toEqual([CLAUDE, AGENTS]);
    expect(reading.folders?.[CLAUDE]?.word).toBe("Up to date");
  });
});

describe("scenarioMismatch on Global folders", () => {
  const counts = (missing: number, notUpdated: number, localEdits: number) => ({
    missing,
    notUpdated,
    localEdits,
  });
  const observed = {
    status: "Local edits",
    release: "v1.1.0 → v2.0.0",
    notice: null,
    skills: {},
    folders: {
      "~/.claude/skills": { word: "Local edits", counts: counts(0, 1, 1) },
    },
  };

  it("passes when each folder shows its word and counts", () => {
    expect(
      scenarioMismatch(
        {
          name: "global-folders",
          expect: {
            folders: {
              "~/.claude/skills": {
                word: "Local edits",
                counts: counts(0, 1, 1),
              },
            },
          },
        },
        "Global",
        observed,
      ),
    ).toBeNull();
  });

  it("names a folder whose counts differ and a folder the cockpit does not show", () => {
    expect(
      scenarioMismatch(
        {
          name: "global-folders",
          expect: {
            folders: {
              "~/.claude/skills": {
                word: "Local edits",
                counts: counts(1, 1, 1),
              },
              "~/.agents/skills": {
                word: "Local edits",
                counts: counts(1, 0, 1),
              },
            },
          },
        },
        "Global",
        observed,
      ),
    ).toBe(
      'scenario "global-folders" (Global): Global folder ~/.claude/skills expected "Local edits, 1 missing, 1 not updated, 1 with local edits", got "Local edits, 0 missing, 1 not updated, 1 with local edits"; Global folder ~/.agents/skills expected "Local edits, 1 missing, 0 not updated, 1 with local edits", got none',
    );
  });
});

describe("recordHashes", () => {
  const lockfile = [
    "dependencies:",
    "- repo_url: fimoklei/maestro-fixture-harness",
    "  deployed_file_hashes:",
    "    .agents/skills/commit-message/SKILL.md: sha256:aaa",
    "    .claude/skills/commit-message/SKILL.md: sha256:aaa",
    "  content_hash: sha256:def",
  ].join("\n");

  it("replaces the recorded hash of each named file and keeps the rest", () => {
    expect(
      recordHashes(lockfile, {
        ".claude/skills/commit-message/SKILL.md": "sha256:bbb",
      }),
    ).toBe(
      lockfile.replace(
        ".claude/skills/commit-message/SKILL.md: sha256:aaa",
        ".claude/skills/commit-message/SKILL.md: sha256:bbb",
      ),
    );
  });

  it("refuses a file the lockfile records no hash for", () => {
    expect(() =>
      recordHashes(lockfile, {
        ".claude/skills/commit-message/notes.md": "sha256:bbb",
      }),
    ).toThrow(
      "the lockfile records no hash for .claude/skills/commit-message/notes.md",
    );
  });
});

describe("harnessMismatch", () => {
  const row = (
    name: string,
    change: HarnessChange,
    restorable = false,
  ): HarnessReadRow => ({ type: "skill", name, change, restorable });
  const harness = (
    proposal: HarnessReadRow[],
    release: HarnessReadRow[],
    releaseState = "pending-release",
  ): HarnessRead => ({
    releaseState,
    stages: {
      proposal: { outcome: "read", rows: proposal },
      release: { outcome: "read", rows: release },
    },
  });

  it("passes when the Harness shows a restorable deletion and unreleased work", () => {
    expect(
      harnessMismatch(
        harness(
          [row("test-plan", "deletion", true)],
          [row("code-review", "edit")],
        ),
      ),
    ).toBeNull();
  });

  it("names a deletion Restore skill cannot bring back", () => {
    expect(
      harnessMismatch(
        harness(
          [row("test-plan", "deletion", false)],
          [row("code-review", "edit")],
        ),
      ),
    ).toBe(
      'scenario "harness-outcomes": test-plan expected a restorable "deletion" row in the proposal stage, got "deletion", not restorable',
    );
  });

  it("names unreleased work the release stage does not show", () => {
    expect(
      harnessMismatch(
        harness([row("test-plan", "deletion", true)], [], "released"),
      ),
    ).toBe(
      'scenario "harness-outcomes": code-review expected an "edit" row in the release stage, got none; release state expected "pending-release", got "released"',
    );
  });

  it("ignores a prompt that shares the skill's name", () => {
    expect(
      harnessMismatch(
        harness(
          [{ ...row("test-plan", "deletion", true), type: "prompt" }],
          [row("code-review", "edit")],
        ),
      ),
    ).toBe(
      'scenario "harness-outcomes": test-plan expected a restorable "deletion" row in the proposal stage, got none',
    );
  });

  it("names a stage the cockpit could not read", () => {
    const state = harness([], [row("code-review", "edit")]);
    state.stages.proposal = { outcome: "unknown" };

    expect(harnessMismatch(state)).toMatch(
      /test-plan expected a restorable "deletion" row in the proposal stage, got a stage read as "unknown"/,
    );
  });
});

describe("harnessOfflineMismatch", () => {
  it("passes when the Harness read reports no answer from the remote", () => {
    expect(
      harnessOfflineMismatch({ freshness: { outcome: "offline" } }),
    ).toBeNull();
  });

  it("names the outcome the read reported instead", () => {
    expect(harnessOfflineMismatch({ freshness: { outcome: "fetched" } })).toBe(
      'scenario "harness-offline": the Harness read expected "offline", got "fetched"',
    );
  });
});

describe("unprefixedHashes", () => {
  it("names every recorded hash without the sha256 prefix", () => {
    const lockfile = [
      "dependencies:",
      "- repo_url: fimoklei/maestro-fixture-harness",
      "  deployed_file_hashes:",
      "    .claude/skills/a/SKILL.md: sha256:abc",
      "    .claude/skills/b/SKILL.md: abc",
      "  content_hash: sha256:def",
      "deployments:",
      "- content_hash: null",
    ].join("\n");

    expect(unprefixedHashes(lockfile)).toEqual([".claude/skills/b/SKILL.md"]);
  });
});

describe("releaseMirrorProblem", () => {
  const expected = { "v1.0.0": "aaa", "v1.1.0": "bbb" };

  it("accepts a clone whose mirrored releases match the fixture", () => {
    expect(releaseMirrorProblem({ expected, mirrored: expected })).toBeNull();
  });

  it("names the redirect when no release was mirrored", () => {
    expect(releaseMirrorProblem({ expected, mirrored: {} })).toMatch(
      /GIT_CONFIG_\* redirect/,
    );
  });

  it("names a release that points at the wrong commit", () => {
    expect(
      releaseMirrorProblem({
        expected,
        mirrored: { "v1.0.0": "aaa", "v1.1.0": "zzz" },
      }),
    ).toMatch(/refs\/maestro\/tags\/v1\.1\.0 is zzz, expected bbb/);
  });
});

describe("noToolsMismatch", () => {
  const folder = (tool: string, detected: boolean) => ({ tool, detected });
  const kept = "/sandbox/home/Projects/scenarios/empty";

  it("passes when no folder's tool is detected and only kept repos remain", () => {
    expect(
      noToolsMismatch({
        deployState: {
          folders: [folder("claude", false), folder("codex", false)],
        },
        repos: [{ path: kept }],
        keptRepos: [kept],
      }),
    ).toBeNull();
  });

  it("names a tool Global still detects", () => {
    expect(
      noToolsMismatch({
        deployState: {
          folders: [folder("claude", false), folder("codex", true)],
        },
        repos: [],
        keptRepos: [],
      }),
    ).toBe('scenario "no-tools": Global expected no detected tool, got codex');
  });

  it("names a repository left registered", () => {
    expect(
      noToolsMismatch({
        deployState: { folders: [folder("claude", false)] },
        repos: [{ path: "/sandbox/home/Projects/checkout-service" }],
        keptRepos: [],
      }),
    ).toBe(
      'scenario "no-tools": expected no other registered repository, got /sandbox/home/Projects/checkout-service',
    );
  });

  it("refuses a Global read without folders", () => {
    expect(
      noToolsMismatch({ deployState: null, repos: [], keptRepos: [] }),
    ).toBe('scenario "no-tools": Global expected its folders, got none');
  });
});
