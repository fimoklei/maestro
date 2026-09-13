import { describe, expect, it } from "vitest";
import type { GitOrigin } from "../deploy/git-origin";
import type { LockfileEntry } from "../lockfile/lockfile";
import { harnessSkillPin, tallyPins } from "./pinned-per-skill";

const HARNESS: GitOrigin = {
  host: "github.com",
  ownerRepo: "fimoklei/agent-harness",
};

function entry(over: Partial<LockfileEntry> = {}): LockfileEntry {
  return {
    resolved_ref: "v0.3.1",
    virtual_path: ".apm/skills/tdd",
    package_type: "claude_skill",
    host: "github.com",
    repo_url: "fimoklei/agent-harness",
    ...over,
  };
}

describe("harnessSkillPin", () => {
  it("reads a per-skill dependency on the connected Harness", () => {
    expect(harnessSkillPin(entry(), HARNESS)).toStrictEqual({
      name: "tdd",
      release: "v0.3.1",
    });
  });

  it("ignores a per-skill entry from another Harness origin", () => {
    expect(harnessSkillPin(entry({ repo_url: "other/harness" }), HARNESS)).toBe(
      null,
    );
    expect(
      harnessSkillPin(entry({ host: "github.example.com" }), HARNESS),
    ).toBe(null);
  });

  it("decides nothing while the connected Harness is unknown", () => {
    expect(harnessSkillPin(entry(), null)).toBe(null);
  });

  it("ignores a root package, which pins no single skill", () => {
    expect(
      harnessSkillPin(
        entry({ package_type: "apm_package", virtual_path: undefined }),
        HARNESS,
      ),
    ).toBe(null);
  });

  it("ignores a row whose path names something other than that one skill", () => {
    expect(
      harnessSkillPin(entry({ virtual_path: "skills/tdd" }), HARNESS),
    ).toBe(null);
  });

  it("ignores a row that names no origin at all", () => {
    expect(
      harnessSkillPin(entry({ host: undefined, repo_url: undefined }), HARNESS),
    ).toBe(null);
  });
});

describe("tallyPins", () => {
  it("counts the skills on one release", () => {
    expect(
      tallyPins([
        { name: "tdd", release: "v0.3.1" },
        { name: "grill", release: "v0.3.1" },
        { name: "jobs", release: "v0.3.1" },
      ]),
    ).toStrictEqual([{ release: "v0.3.1", skills: 3 }]);
  });

  it("puts the biggest group of disagreeing tags first", () => {
    expect(
      tallyPins([
        { name: "jobs", release: "v0.3.0" },
        { name: "tdd", release: "v0.3.1" },
        { name: "grill", release: "v0.3.1" },
        { name: "wizard", release: "v0.3.1" },
      ]),
    ).toStrictEqual([
      { release: "v0.3.1", skills: 3 },
      { release: "v0.3.0", skills: 1 },
    ]);
  });

  it("orders groups of the same size by their release, newest first", () => {
    expect(
      tallyPins([
        { name: "jobs", release: "v0.3.0" },
        { name: "tdd", release: "v0.3.1" },
      ]),
    ).toStrictEqual([
      { release: "v0.3.1", skills: 1 },
      { release: "v0.3.0", skills: 1 },
    ]);
  });

  it("counts one skill once per release it is pinned at", () => {
    expect(
      tallyPins([
        { name: "tdd", release: "v0.3.1" },
        { name: "tdd", release: "v0.3.1" },
      ]),
    ).toStrictEqual([{ release: "v0.3.1", skills: 1 }]);
  });

  it("reads no status from no pins", () => {
    expect(tallyPins([])).toBeUndefined();
  });
});
