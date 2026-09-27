import { describe, expect, it } from "vitest";
import {
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
    expect(SCENARIO_NAMES).toHaveLength(8);
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
