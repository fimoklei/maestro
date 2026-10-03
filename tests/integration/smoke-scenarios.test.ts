import { describe, expect, it } from "vitest";
import {
  globalLeftoverMismatch,
  type HarnessRead,
  harnessMismatch,
  harnessOfflineMismatch,
  parseScenarioArg,
  readCockpit,
  releaseMirrorProblem,
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
    expect(SCENARIO_NAMES).toHaveLength(13);
    expect(SCENARIO_NAMES).toEqual(
      expect.arrayContaining([
        "harness-outcomes",
        "import-edits",
        "unreadable",
        "global-leftover",
        "harness-offline",
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

  it("reads a refused deploy-state as the screen's failure notice", () => {
    const observed = readCockpit({ deployState: null, drift: { ok: false } });

    expect(
      scenarioMismatch(
        { name: "unreadable", expect: { status: "Deploy-state not read" } },
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

describe("harnessMismatch", () => {
  const row = (skill: string, status: string, restorable = false) => ({
    skill,
    status,
    restorable,
  });
  const harness = (
    proposal: ReturnType<typeof row>[],
    release: ReturnType<typeof row>[],
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
          [row("test-plan", "deleted-locally", true)],
          [row("code-review", "changed")],
        ),
      ),
    ).toBeNull();
  });

  it("names a deletion Restore skill cannot bring back", () => {
    expect(
      harnessMismatch(
        harness(
          [row("test-plan", "deleted-locally", false)],
          [row("code-review", "changed")],
        ),
      ),
    ).toBe(
      'scenario "harness-outcomes": test-plan expected a restorable "deleted-locally" row in the proposal stage, got "deleted-locally", not restorable',
    );
  });

  it("names unreleased work the release stage does not show", () => {
    expect(
      harnessMismatch(
        harness([row("test-plan", "deleted-locally", true)], [], "released"),
      ),
    ).toBe(
      'scenario "harness-outcomes": code-review expected a "changed" row in the release stage, got none; release state expected "pending-release", got "released"',
    );
  });

  it("names a stage the cockpit could not read", () => {
    const state = harness([], [row("code-review", "changed")]);
    state.stages.proposal = { outcome: "unknown" };

    expect(harnessMismatch(state)).toMatch(
      /test-plan expected a restorable "deleted-locally" row in the proposal stage, got a stage read as "unknown"/,
    );
  });
});

describe("globalLeftoverMismatch", () => {
  const LEFTOVER = "/sandbox/home/.claude/skills/code-review";

  it("passes when the global Remove offers the leftover copy that is on disk", () => {
    expect(
      globalLeftoverMismatch({
        preflight: {
          check: { scope: "global", tools: [{ tool: "codex" }] },
          reclaim: { previews: [{ tool: "claude", path: LEFTOVER }] },
        },
        onDisk: (path) => path === LEFTOVER,
      }),
    ).toBeNull();
  });

  it("names a global Remove with no Other copies row", () => {
    expect(
      globalLeftoverMismatch({
        preflight: {
          check: { scope: "global", tools: [{ tool: "codex" }] },
          reclaim: null,
        },
        onDisk: () => true,
      }),
    ).toBe(
      'scenario "global-leftover": the global Remove of code-review expected an Other copies row for Claude Code, got none',
    );
  });

  it("names an Other copies row whose copy is not on disk", () => {
    expect(
      globalLeftoverMismatch({
        preflight: {
          check: { scope: "global", tools: [{ tool: "codex" }] },
          reclaim: { previews: [{ tool: "claude", path: LEFTOVER }] },
        },
        onDisk: () => false,
      }),
    ).toBe(
      `scenario "global-leftover": the Other copies row names ${LEFTOVER}, which holds no copy`,
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
