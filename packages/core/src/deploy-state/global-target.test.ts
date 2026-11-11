import { describe, expect, it } from "vitest";
import { DEFAULT_GLOBAL_LAYOUT } from "../deploy/global-layout.fake";
import { readGlobalTarget } from "./global-target";

type LockfileEntry = Parameters<typeof readGlobalTarget>[0][number];

// Per-skill entries are never probed on disk; a root-package one is (#941).
const ALL_ON_DISK = {
  layout: DEFAULT_GLOBAL_LAYOUT,
  fileExists: async () => true,
};

// deployed_files prefixes decide which folder the copy sits in.
function skillEntry(
  name: string,
  ref: string,
  deployedFiles: string[],
  repoUrl?: string,
): LockfileEntry {
  return {
    resolved_ref: ref,
    virtual_path: `skills/${name}`,
    package_type: "claude_skill",
    deployed_files: deployedFiles,
    repo_url: repoUrl,
  };
}

const copiesBy = (result: Awaited<ReturnType<typeof readGlobalTarget>>) =>
  result.folders.map((folder) => [
    folder.path,
    folder.detected,
    folder.primitives.map((primitive) => primitive.name),
  ]);

describe("readGlobalTarget", () => {
  it("lists every Global folder, even one with nothing deployed", async () => {
    const result = await readGlobalTarget([], ["claude", "codex"], ALL_ON_DISK);

    expect(copiesBy(result)).toEqual([
      ["~/.claude/skills", true, []],
      ["~/.agents/skills", true, []],
    ]);
    expect(result.primitives).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("reads no copy into an undetected tool's folder", async () => {
    const entry = skillEntry("tdd", "v0.5.0", [
      ".claude/skills/tdd",
      ".agents/skills/tdd",
    ]);

    const result = await readGlobalTarget([entry], ["claude"], ALL_ON_DISK);

    expect(copiesBy(result)).toEqual([
      ["~/.claude/skills", true, ["tdd"]],
      ["~/.agents/skills", false, []],
    ]);
  });

  it("attributes a two-tool skill to each folder its files sit in, and lists it once", async () => {
    const entry = skillEntry("tdd", "v0.5.1", [
      ".claude/skills/tdd",
      ".claude/skills/tdd/SKILL.md",
      ".agents/skills/tdd",
      ".agents/skills/tdd/SKILL.md",
    ]);

    const result = await readGlobalTarget(
      [entry],
      ["claude", "codex"],
      ALL_ON_DISK,
    );

    expect(copiesBy(result)).toEqual([
      ["~/.claude/skills", true, ["tdd"]],
      ["~/.agents/skills", true, ["tdd"]],
    ]);
    expect(result.primitives).toEqual([
      { type: "skill", name: "tdd", version: "v0.5.1" },
    ]);
  });

  it("does not back-fill a claude-only skill under ~/.agents/skills", async () => {
    const entry = skillEntry("tdd", "v0.5.0", [
      ".claude/skills/tdd",
      ".claude/skills/tdd/SKILL.md",
    ]);

    const result = await readGlobalTarget(
      [entry],
      ["claude", "codex"],
      ALL_ON_DISK,
    );

    expect(copiesBy(result)).toEqual([
      ["~/.claude/skills", true, ["tdd"]],
      ["~/.agents/skills", true, []],
    ]);
  });

  it("skips an entry of an unsupported package_type and surfaces it once", async () => {
    const hook: LockfileEntry = {
      resolved_ref: "v0.5.0",
      virtual_path: "hooks/format",
      package_type: "claude_hook",
      deployed_files: [".claude/hooks/format"],
    };
    const skill = skillEntry("tdd", "v0.5.0", [".claude/skills/tdd"]);

    const result = await readGlobalTarget(
      [hook, skill],
      ["claude"],
      ALL_ON_DISK,
    );

    expect(result.primitives).toEqual([
      { type: "skill", name: "tdd", version: "v0.5.0" },
    ]);
    expect(result.skipped).toEqual([
      {
        reason: "unsupported-type",
        virtualPath: "hooks/format",
        packageType: "claude_hook",
      },
    ]);
  });

  it("names the origin of a skill entry no detected tool's folder holds", async () => {
    const entry = skillEntry(
      "tdd",
      "v0.5.1",
      ["skills/tdd"],
      "fimoklei/agent-harness",
    );

    const result = await readGlobalTarget(
      [entry],
      ["claude", "codex"],
      ALL_ON_DISK,
    );

    expect(result.primitives).toEqual([]);
    expect(result.otherOrigins).toEqual(["fimoklei/agent-harness"]);
  });

  it("dedupes the same unattributed origin across multiple entries", async () => {
    const entries = [
      skillEntry("tdd", "v0.5.1", ["skills/tdd"], "fimoklei/agent-harness"),
      skillEntry(
        "diagnose",
        "v0.5.1",
        ["skills/diagnose"],
        "fimoklei/agent-harness",
      ),
    ];

    const result = await readGlobalTarget(entries, ["claude"], ALL_ON_DISK);

    expect(result.otherOrigins).toEqual(["fimoklei/agent-harness"]);
  });

  it("never names an origin for an entry a detected folder already holds", async () => {
    const entry = skillEntry(
      "tdd",
      "v0.5.1",
      [".claude/skills/tdd"],
      "fimoklei/agent-harness",
    );

    const result = await readGlobalTarget([entry], ["claude"], ALL_ON_DISK);

    expect(result.otherOrigins).toEqual([]);
  });

  it("keeps a hybrid skill apart from a genuinely different primitive", async () => {
    const hybrid: LockfileEntry = {
      resolved_ref: "v0.5.0",
      virtual_path: "skills/tdd",
      package_type: "hybrid",
      deployed_files: [".claude/skills/tdd"],
    };

    const result = await readGlobalTarget([hybrid], ["claude"], ALL_ON_DISK);

    expect(result.primitives).toEqual([]);
    expect(result.skipped).toEqual([
      {
        reason: "unmanageable-skill",
        virtualPath: "skills/tdd",
        packageType: "hybrid",
      },
    ]);
  });
});
