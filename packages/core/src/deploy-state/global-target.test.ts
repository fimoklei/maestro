import { describe, expect, it } from "vitest";
import { DEFAULT_GLOBAL_LAYOUT } from "../deploy/global-layout.fake";
import { readGlobalTarget } from "./global-target";

type LockfileEntry = Parameters<typeof readGlobalTarget>[0][number];

const ALL_ON_DISK = {
  layout: DEFAULT_GLOBAL_LAYOUT,
  deployments: [],
  fileExists: async () => true,
};

const claudeRows = (files: readonly string[]) =>
  files.map((value) => ({ target: "claude", value }));

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

const MOVED_CLAUDE_LAYOUT = {
  ...DEFAULT_GLOBAL_LAYOUT,
  roots: { ...DEFAULT_GLOBAL_LAYOUT.roots, claude: ".claude-work" },
};

describe("readGlobalTarget on a former Claude Code folder", () => {
  it("reads copies left in ~/.claude after CLAUDE_CONFIG_DIR is set into a former folder row", async () => {
    const entry = skillEntry("tdd", "v0.5.1", [
      ".claude-work/skills/tdd/SKILL.md",
      ".claude/skills/tdd/SKILL.md",
    ]);

    const result = await readGlobalTarget([entry], ["claude"], {
      ...ALL_ON_DISK,
      layout: MOVED_CLAUDE_LAYOUT,
      deployments: claudeRows(entry.deployed_files ?? []),
    });

    expect(copiesBy(result)).toEqual([
      ["~/.claude-work/skills", true, ["tdd"]],
      ["~/.agents/skills", false, []],
      ["~/.claude/skills", false, ["tdd"]],
    ]);
    expect(result.folders.map((folder) => folder.former ?? false)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("reads copies left in the variable's folder after CLAUDE_CONFIG_DIR is unset", async () => {
    const entry = skillEntry("tdd", "v0.5.1", [
      ".claude/skills/tdd/SKILL.md",
      ".claude-work/skills/tdd/SKILL.md",
    ]);

    const result = await readGlobalTarget([entry], ["claude"], {
      ...ALL_ON_DISK,
      deployments: claudeRows(entry.deployed_files ?? []),
    });

    expect(copiesBy(result)).toEqual([
      ["~/.claude/skills", true, ["tdd"]],
      ["~/.agents/skills", false, []],
      ["~/.claude-work/skills", false, ["tdd"]],
    ]);
  });

  it("shows no former folder whose copies are gone from disk", async () => {
    const entry = skillEntry("tdd", "v0.5.1", [
      ".claude-work/skills/tdd/SKILL.md",
      ".claude/skills/tdd/SKILL.md",
    ]);

    const result = await readGlobalTarget([entry], ["claude"], {
      ...ALL_ON_DISK,
      layout: MOVED_CLAUDE_LAYOUT,
      deployments: claudeRows(entry.deployed_files ?? []),
      fileExists: async (file) => !file.startsWith(".claude/"),
    });

    expect(result.folders.map((folder) => folder.path)).toEqual([
      "~/.claude-work/skills",
      "~/.agents/skills",
    ]);
  });

  it("names no former folder for a deploy root other than claude", async () => {
    const entry = skillEntry("tdd", "v0.5.1", [
      ".claude/skills/tdd/SKILL.md",
      ".cursor/skills/tdd/SKILL.md",
    ]);

    const result = await readGlobalTarget([entry], ["claude"], {
      ...ALL_ON_DISK,
      deployments: [{ target: "cursor", value: ".cursor/skills/tdd/SKILL.md" }],
    });

    expect(result.folders.map((folder) => folder.path)).toEqual([
      "~/.claude/skills",
      "~/.agents/skills",
    ]);
  });

  it("names no former folder outside HOME", async () => {
    const entry = skillEntry("tdd", "v0.5.1", [
      ".claude/skills/tdd/SKILL.md",
      "../elsewhere/skills/tdd/SKILL.md",
      "/abs/skills/tdd/SKILL.md",
    ]);

    const result = await readGlobalTarget([entry], ["claude"], {
      ...ALL_ON_DISK,
      deployments: claudeRows(entry.deployed_files ?? []),
    });

    expect(result.folders.map((folder) => folder.path)).toEqual([
      "~/.claude/skills",
      "~/.agents/skills",
    ]);
  });
});

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

  it("reads no copy from a sibling folder whose name starts like a tool's", async () => {
    const entry = skillEntry("tdd", "v0.5.1", [".claudex/skills/tdd"]);

    const result = await readGlobalTarget([entry], ["claude"], ALL_ON_DISK);

    expect(copiesBy(result)).toEqual([
      ["~/.claude/skills", true, []],
      ["~/.agents/skills", false, []],
    ]);
  });

  it("follows the first root package as the Harness dependency", async () => {
    const rootPackage = (ref: string): LockfileEntry => ({
      repo_url: "fimoklei/agent-harness",
      resolved_ref: ref,
      package_type: "apm_package",
      deployed_files: [".claude/skills/tdd/SKILL.md"],
    });

    const result = await readGlobalTarget(
      [rootPackage("v0.3.2"), rootPackage("v0.2.0")],
      ["claude"],
      ALL_ON_DISK,
    );

    expect(result.release).toBe("v0.3.2");
    expect(result.primitives).toEqual([
      { type: "skill", name: "tdd", version: "v0.3.2" },
    ]);
  });

  it("reads the Harness page once for every entry that links, and never where none could", async () => {
    let reads = 0;
    const deps = {
      ...ALL_ON_DISK,
      harnessPage: async () => {
        reads += 1;
        return null;
      },
    };
    const entries = [
      skillEntry("tdd", "v0.5.1", [".claude/skills/tdd"]),
      skillEntry("grill", "v0.5.1", [".claude/skills/grill"]),
    ];

    await readGlobalTarget(entries, ["claude"], deps);
    expect(reads).toBe(1);
    await readGlobalTarget([], ["claude"], deps);
    expect(reads).toBe(1);
  });
});
