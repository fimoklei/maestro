import { describe, expect, it } from "vitest";
import type { LockfileEntry } from "../lockfile/lockfile";
import { groupPrimitivesByTool } from "./group-primitives-by-tool";

// Per-skill entries are never probed on disk; a root-package one is (#941).
const ALL_ON_DISK = { fileExists: async () => true };

// deployed_files prefixes decide which tool the copy belongs to.
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

describe("groupPrimitivesByTool", () => {
  it("lists every detected tool, even one with nothing deployed", async () => {
    const result = await groupPrimitivesByTool(
      [],
      ["claude", "codex"],
      ALL_ON_DISK,
    );

    expect(result.tools).toEqual([
      { tool: "claude", primitives: [] },
      { tool: "codex", primitives: [] },
    ]);
    expect(result.skipped).toEqual([]);
  });

  it("does not list a tool that is not detected", async () => {
    const entry = skillEntry("tdd", "v0.5.0", [
      ".claude/skills/tdd",
      ".agents/skills/tdd",
    ]);

    const result = await groupPrimitivesByTool(
      [entry],
      ["claude"],
      ALL_ON_DISK,
    );

    expect(result.tools).toEqual([
      {
        tool: "claude",
        primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      },
    ]);
  });

  it("attributes a two-tool skill to each tool whose prefix it carries", async () => {
    const entry = skillEntry("tdd", "v0.5.1", [
      ".claude/skills/tdd",
      ".claude/skills/tdd/SKILL.md",
      ".agents/skills/tdd",
      ".agents/skills/tdd/SKILL.md",
    ]);

    const result = await groupPrimitivesByTool(
      [entry],
      ["claude", "codex"],
      ALL_ON_DISK,
    );

    expect(result.tools).toEqual([
      {
        tool: "claude",
        primitives: [{ type: "skill", name: "tdd", version: "v0.5.1" }],
      },
      {
        tool: "codex",
        primitives: [{ type: "skill", name: "tdd", version: "v0.5.1" }],
      },
    ]);
  });

  it("does not back-fill a claude-only skill under codex", async () => {
    const entry = skillEntry("tdd", "v0.5.0", [
      ".claude/skills/tdd",
      ".claude/skills/tdd/SKILL.md",
    ]);

    const result = await groupPrimitivesByTool(
      [entry],
      ["claude", "codex"],
      ALL_ON_DISK,
    );

    expect(result.tools).toEqual([
      {
        tool: "claude",
        primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      },
      { tool: "codex", primitives: [] },
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

    const result = await groupPrimitivesByTool(
      [hook, skill],
      ["claude"],
      ALL_ON_DISK,
    );

    expect(result.tools).toEqual([
      {
        tool: "claude",
        primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      },
    ]);
    expect(result.skipped).toEqual([
      {
        reason: "unsupported-type",
        virtualPath: "hooks/format",
        packageType: "claude_hook",
      },
    ]);
  });

  it("names the origin of a skill entry no detected tool's prefix covers", async () => {
    const entry = skillEntry(
      "tdd",
      "v0.5.1",
      ["skills/tdd"],
      "fimoklei/agent-harness",
    );

    const result = await groupPrimitivesByTool(
      [entry],
      ["claude", "codex"],
      ALL_ON_DISK,
    );

    expect(result.tools).toEqual([
      { tool: "claude", primitives: [] },
      { tool: "codex", primitives: [] },
    ]);
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

    const result = await groupPrimitivesByTool(
      entries,
      ["claude"],
      ALL_ON_DISK,
    );

    expect(result.otherOrigins).toEqual(["fimoklei/agent-harness"]);
  });

  it("never names an origin for an entry a tool prefix already claims", async () => {
    const entry = skillEntry(
      "tdd",
      "v0.5.1",
      [".claude/skills/tdd"],
      "fimoklei/agent-harness",
    );

    const result = await groupPrimitivesByTool(
      [entry],
      ["claude"],
      ALL_ON_DISK,
    );

    expect(result.otherOrigins).toEqual([]);
  });

  it("keeps a hybrid skill apart from a genuinely different primitive", async () => {
    const hybrid: LockfileEntry = {
      resolved_ref: "v0.5.0",
      virtual_path: "skills/tdd",
      package_type: "hybrid",
      deployed_files: [".claude/skills/tdd"],
    };

    const result = await groupPrimitivesByTool(
      [hybrid],
      ["claude"],
      ALL_ON_DISK,
    );

    expect(result.tools).toEqual([{ tool: "claude", primitives: [] }]);
    expect(result.skipped).toEqual([
      {
        reason: "unmanageable-skill",
        virtualPath: "skills/tdd",
        packageType: "hybrid",
      },
    ]);
  });
});
