import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildFixtureHarness,
  FIXTURE_RELEASES,
  publishFixtureRelease,
  pushUnreleasedChange,
} from "../../scripts/fixture-harness.mjs";
import { removeGitTempTree } from "../helpers/git-fixture";

const fixtureDir = fileURLToPath(
  new URL("../fixtures/fixture-harness", import.meta.url),
);

const tags = (bare: string) =>
  execFileSync(
    "git",
    ["-C", bare, "for-each-ref", "--format=%(refname) %(objectname)"],
    { encoding: "utf8" },
  );

describe("the scenarios' fixture Harness", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maestro-fixture-harness-"));
  });

  afterEach(async () => {
    await removeGitTempTree(root);
  });

  it("builds the same commit for each release on every run", () => {
    const first = buildFixtureHarness({ fixtureDir, workDir: join(root, "a") });
    const second = buildFixtureHarness({
      fixtureDir,
      workDir: join(root, "b"),
    });

    expect(Object.keys(first)).toEqual(FIXTURE_RELEASES);
    expect(second).toEqual(first);
  });

  it("publishes only the releases up to the one asked for", () => {
    const workDir = join(root, "work");
    const bare = join(root, "fixture.git");
    const commits = buildFixtureHarness({ fixtureDir, workDir });

    publishFixtureRelease({ workDir, bareDir: bare, release: "v2.0.0" });
    publishFixtureRelease({ workDir, bareDir: bare, release: "v1.1.0" });

    expect(tags(bare)).toBe(
      [
        `refs/heads/main ${commits["v1.1.0"]}`,
        `refs/tags/v1.0.0 ${commits["v1.0.0"]}`,
        `refs/tags/v1.1.0 ${commits["v1.1.0"]}`,
        "",
      ].join("\n"),
    );
  });

  it("pushes one untagged change to a skill after the published release", () => {
    const workDir = join(root, "work");
    const bare = join(root, "fixture.git");
    const commits = buildFixtureHarness({ fixtureDir, workDir });
    publishFixtureRelease({ workDir, bareDir: bare, release: "v2.0.0" });

    pushUnreleasedChange({ workDir, bareDir: bare, skill: "commit-message" });

    const git = (...args: string[]) =>
      execFileSync("git", ["-C", bare, ...args], { encoding: "utf8" }).trim();
    expect(git("rev-parse", "main~1")).toBe(commits["v2.0.0"]);
    expect(git("tag", "--points-at", "main")).toBe("");
    expect(git("diff", "--name-only", "v2.0.0", "main")).toBe(
      ".apm/skills/commit-message/SKILL.md",
    );
  });
});
