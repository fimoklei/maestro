import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SupportedTool } from "../deploy/deploy-tools";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import type { ToolPresencePort } from "../tools/tool-presence-port";
import {
  DeployStateReader,
  GlobalDeployStateReader,
} from "./deploy-state-reader";

// A fake presence port: the global read lists exactly these tools, in order.
function fakePresence(tools: SupportedTool[]): ToolPresencePort {
  return { detectGlobalTools: async () => tools };
}

// The exact apm output a two-tool install (-t claude,codex) writes: one entry,
// package_type claude_skill, two deployed_files. Captured by the 01.2 spike.
const TWO_TOOL_LOCKFILE = readFileSync(
  new URL(
    "../../../../tests/fixtures/apm.lock.global-two-tool.yaml",
    import.meta.url,
  ),
  "utf8",
);

const REPO = "/repo";
const LOCKFILE = `${REPO}/apm.lock.yaml`;

// Builds an apm.lock.yaml the way apm writes it: a tag-pinned skill entry has
// resolved_ref (the human tag), virtual_path, and package_type. See
// .claude/rules/apm-driver.md for the observed shape.
function lockfile(entries: string): string {
  return `lockfile_version: '1'\ngenerated_at: '2026-06-05T13:22:03+00:00'\napm_version: 0.16.0\ndependencies:\n${entries}`;
}

function skillEntry(ref: string, virtualPath: string): string {
  return `- repo_url: fimoklei/agent-harness\n  host: github.com\n  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb\n  resolved_ref: ${ref}\n  virtual_path: ${virtualPath}\n  is_virtual: true\n  package_type: claude_skill\n  deployed_files:\n  - .claude/${virtualPath}\n  content_hash: sha256:abc\n`;
}

// The same entry under any package_type apm may record.
function typedEntry(virtualPath: string, packageType: string): string {
  return `- repo_url: fimoklei/agent-harness\n  host: github.com\n  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb\n  resolved_ref: v0.5.0\n  virtual_path: ${virtualPath}\n  is_virtual: true\n  package_type: ${packageType}\n  deployed_files:\n  - .claude/${virtualPath}\n  content_hash: sha256:abc\n`;
}

describe("DeployStateReader", () => {
  it("marks a hybrid skill as unsupported, not as a different primitive", async () => {
    const fs = new InMemoryFileSystem({
      files: { [LOCKFILE]: lockfile(typedEntry("skills/tdd", "hybrid")) },
    });
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: true,
      primitives: [],
      skipped: [
        {
          reason: "unmanageable-skill",
          virtualPath: "skills/tdd",
          packageType: "hybrid",
        },
      ],
    });
  });

  it("marks apm's invalid verdict as invalid, so the row cannot read as deployed", async () => {
    const fs = new InMemoryFileSystem({
      files: { [LOCKFILE]: lockfile(typedEntry("skills/tdd", "invalid")) },
    });
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: true,
      primitives: [],
      skipped: [
        {
          reason: "invalid-package",
          virtualPath: "skills/tdd",
          packageType: "invalid",
        },
      ],
    });
  });

  it("lists a deployed skill with its name and human tag version", async () => {
    const fs = new InMemoryFileSystem({
      files: { [LOCKFILE]: lockfile(skillEntry("v0.5.0", "skills/tdd")) },
    });
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: true,
      primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      skipped: [],
    });
  });

  it("lists every deployed skill", async () => {
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(
          skillEntry("v0.5.0", "skills/tdd") +
            skillEntry("v1.2.0", "skills/diagnose"),
        ),
      },
    });
    const reader = new DeployStateReader({ fs });

    const result = await reader.read(REPO);

    expect(result).toEqual({
      ok: true,
      primitives: [
        { type: "skill", name: "tdd", version: "v0.5.0" },
        { type: "skill", name: "diagnose", version: "v1.2.0" },
      ],
      skipped: [],
    });
  });

  it("surfaces a two-tool install as one skill, not one per deployed file", async () => {
    const fs = new InMemoryFileSystem({
      files: { [LOCKFILE]: TWO_TOOL_LOCKFILE },
    });
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: true,
      primitives: [{ type: "skill", name: "tdd", version: "v0.5.1" }],
      skipped: [],
    });
  });

  it("shows an empty list when the repo has no lockfile", async () => {
    const fs = new InMemoryFileSystem();
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: true,
      primitives: [],
      skipped: [],
    });
  });

  it("shows an empty list when the lockfile has no dependencies", async () => {
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]:
          "lockfile_version: '1'\napm_version: 0.16.0\ndependencies: []\n",
      },
    });
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: true,
      primitives: [],
      skipped: [],
    });
  });

  it("reports malformed when the lockfile is not valid YAML", async () => {
    const fs = new InMemoryFileSystem({
      files: { [LOCKFILE]: "dependencies: [unterminated\n" },
    });
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: false,
      error: "malformed",
    });
  });

  it("reports malformed when the lockfile shape is invalid", async () => {
    const fs = new InMemoryFileSystem({
      // Valid YAML, but dependencies is not the expected array of entries.
      files: { [LOCKFILE]: "dependencies: not-a-list\n" },
    });
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: false,
      error: "malformed",
    });
  });

  it("skips an entry of an unsupported package_type and surfaces it", async () => {
    const hookEntry =
      "- repo_url: fimoklei/agent-harness\n  host: github.com\n  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb\n  resolved_ref: v0.5.0\n  virtual_path: hooks/format\n  is_virtual: true\n  package_type: claude_hook\n  deployed_files:\n  - .claude/hooks/format\n  content_hash: sha256:abc\n";
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(hookEntry + skillEntry("v0.5.0", "skills/tdd")),
      },
    });
    const reader = new DeployStateReader({ fs });

    const result = await reader.read(REPO);

    expect(result).toEqual({
      ok: true,
      primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      skipped: [
        {
          reason: "unsupported-type",
          virtualPath: "hooks/format",
          packageType: "claude_hook",
        },
      ],
    });
  });

  it("keeps the readable skills when one entry cannot be interpreted", async () => {
    // apm writes a `source: local` entry with no resolved_ref (#357).
    const localEntry =
      "- virtual_path: skills/local-one\n  package_type: claude_skill\n  source: local\n";
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(localEntry + skillEntry("v0.5.0", "skills/tdd")),
      },
    });
    const reader = new DeployStateReader({ fs });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: true,
      primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
      skipped: [{ reason: "unreadable", virtualPath: "skills/local-one" }],
    });
  });
});

// The global (user-scope) read: same lockfile, but grouped per detected tool.
const GLOBAL_ROOT = "/home/.apm";
const GLOBAL_LOCKFILE = `${GLOBAL_ROOT}/apm.lock.yaml`;

// A two-tool skill entry (both .claude and .agents copies), the shape apm writes
// for `-t claude,codex` (apm-driver.md).
function twoToolEntry(ref: string, name: string): string {
  return `- repo_url: fimoklei/agent-harness\n  host: github.com\n  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb\n  resolved_ref: ${ref}\n  virtual_path: .apm/skills/${name}\n  is_virtual: true\n  package_type: claude_skill\n  deployed_files:\n  - .claude/skills/${name}\n  - .agents/skills/${name}\n  content_hash: sha256:abc\n`;
}

describe("GlobalDeployStateReader.readGlobal", () => {
  it("groups deployed skills under each detected tool by their prefix", async () => {
    const fs = new InMemoryFileSystem({
      files: { [GLOBAL_LOCKFILE]: lockfile(twoToolEntry("v0.5.0", "tdd")) },
    });
    const reader = new GlobalDeployStateReader({
      fs,
      toolPresence: fakePresence(["claude", "codex"]),
    });

    await expect(reader.readGlobal(GLOBAL_ROOT)).resolves.toEqual({
      ok: true,
      tools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
        },
        {
          tool: "codex",
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
        },
      ],
      skipped: [],
      otherOrigins: [],
    });
  });

  it("names the origin of a global skill no detected tool's prefix covers (#655)", async () => {
    const entry =
      "- repo_url: fimoklei/agent-harness\n  host: github.com\n  resolved_commit: ec491f154c9d5c9a6c5db56d1946c4c34f3899bb\n  resolved_ref: v0.5.1\n  virtual_path: skills/tdd\n  is_virtual: true\n  package_type: claude_skill\n  deployed_files:\n  - skills/tdd\n  content_hash: sha256:abc\n";
    const fs = new InMemoryFileSystem({
      files: { [GLOBAL_LOCKFILE]: lockfile(entry) },
    });
    const reader = new GlobalDeployStateReader({
      fs,
      toolPresence: fakePresence(["claude", "codex"]),
    });

    await expect(reader.readGlobal(GLOBAL_ROOT)).resolves.toEqual({
      ok: true,
      tools: [
        { tool: "claude", primitives: [] },
        { tool: "codex", primitives: [] },
      ],
      skipped: [],
      otherOrigins: ["fimoklei/agent-harness"],
    });
  });

  it("lists a detected tool with nothing deployed as an empty group", async () => {
    const fs = new InMemoryFileSystem({
      files: {
        [GLOBAL_LOCKFILE]: lockfile(skillEntry("v0.5.0", "skills/tdd")),
      },
    });
    const reader = new GlobalDeployStateReader({
      fs,
      toolPresence: fakePresence(["claude", "codex"]),
    });

    await expect(reader.readGlobal(GLOBAL_ROOT)).resolves.toEqual({
      ok: true,
      tools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
        },
        { tool: "codex", primitives: [] },
      ],
      skipped: [],
      otherOrigins: [],
    });
  });

  it("returns an empty group per detected tool when there is no lockfile", async () => {
    const fs = new InMemoryFileSystem();
    const reader = new GlobalDeployStateReader({
      fs,
      toolPresence: fakePresence(["claude", "codex"]),
    });

    await expect(reader.readGlobal(GLOBAL_ROOT)).resolves.toEqual({
      ok: true,
      tools: [
        { tool: "claude", primitives: [] },
        { tool: "codex", primitives: [] },
      ],
      skipped: [],
      otherOrigins: [],
    });
  });

  it("reports malformed for a broken global lockfile", async () => {
    const fs = new InMemoryFileSystem({
      files: { [GLOBAL_LOCKFILE]: "dependencies: not-a-list\n" },
    });
    const reader = new GlobalDeployStateReader({
      fs,
      toolPresence: fakePresence(["claude"]),
    });

    await expect(reader.readGlobal(GLOBAL_ROOT)).resolves.toEqual({
      ok: false,
      error: "malformed",
    });
  });
});

// The root-package shape: one apm_package dependency deploying many skills,
// captured by the #941 narrowing spike.
const PHANTOM_LOCKFILE = readFileSync(
  new URL(
    "../../../../tests/fixtures/apm.lock.spike-941-step3d-phantom.yaml",
    import.meta.url,
  ),
  "utf8",
);

// Keys copied from that capture: a root-package row carries no virtual_path.
function rootPackageEntry(
  ref: string,
  deployedFiles: string[],
  subset: string[],
): string {
  const files = deployedFiles.map((file) => `  - ${file}\n`).join("");
  const skills = subset.map((name) => `  - ${name}\n`).join("");
  return `- repo_url: fimoklei/agent-harness\n  name: agent-harness\n  host: github.com\n  resolved_commit: 4beb072048aa5952555e8a3941d3d1873abfe6e7\n  resolved_ref: ${ref}\n  package_type: apm_package\n  deployed_files:\n${files}  skill_subset:\n${skills}`;
}

// Every file the entry names is on disk, so nothing reads as a phantom.
function onDisk(root: string, files: string[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [`${root}/${file}`, "x"]));
}

describe("DeployStateReader on a root-package target", () => {
  it("lists the skills its deployed files name, at the target's release", async () => {
    const files = [
      ".claude/skills/tdd/SKILL.md",
      ".agents/skills/tdd/SKILL.md",
      ".claude/skills/grill/SKILL.md",
    ];
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(
          rootPackageEntry("v0.3.2", files, ["tdd", "grill"]),
        ),
        ...onDisk(REPO, files),
      },
    });

    await expect(new DeployStateReader({ fs }).read(REPO)).resolves.toEqual({
      ok: true,
      primitives: [
        { type: "skill", name: "tdd", version: "v0.3.2" },
        { type: "skill", name: "grill", version: "v0.3.2" },
      ],
      skipped: [],
    });
  });

  it("never reads a name from skill_subset that no file on disk backs", async () => {
    const files = [".claude/skills/tdd/SKILL.md"];
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(
          rootPackageEntry("v0.3.2", files, ["tdd", "removed-long-ago"]),
        ),
        ...onDisk(REPO, files),
      },
    });

    const result = await new DeployStateReader({ fs }).read(REPO);

    expect(result).toEqual({
      ok: true,
      primitives: [{ type: "skill", name: "tdd", version: "v0.3.2" }],
      skipped: [],
    });
  });

  it("does not count a recorded row whose file is gone from disk", async () => {
    // The real phantom capture: `delta` is recorded under .agents but the
    // narrow deleted the file (#941 step 3d).
    const onlyRealFiles = [
      ".agents/skills/alpha/SKILL.md",
      ".claude/skills/alpha/SKILL.md",
    ];
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: PHANTOM_LOCKFILE,
        ...onDisk(REPO, onlyRealFiles),
      },
    });

    const result = await new DeployStateReader({ fs }).read(REPO);

    expect(result).toEqual({
      ok: true,
      primitives: [{ type: "skill", name: "alpha", version: "v2.0.0" }],
      skipped: [],
    });
  });

  it("reads no Release head without a reader for it", async () => {
    const files = [".claude/skills/tdd/SKILL.md"];
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(rootPackageEntry("v0.3.2", files, ["tdd"])),
        ...onDisk(REPO, files),
      },
    });

    const result = await new DeployStateReader({ fs }).read(REPO);

    expect(result).toMatchObject({ ok: true });
    expect(
      "releaseHead" in result ? result.releaseHead : undefined,
    ).toBeUndefined();
  });

  it("carries the Release head over the skills it found deployed", async () => {
    const files = [
      ".claude/skills/tdd/SKILL.md",
      ".claude/skills/grill/SKILL.md",
    ];
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(
          rootPackageEntry("v0.3.2", files, ["tdd", "grill"]),
        ),
        ...onDisk(REPO, files),
      },
    });
    const seen: string[][] = [];
    const reader = new DeployStateReader({
      fs,
      releaseHead: {
        read: async (input) => {
          seen.push([...input.selection]);
          return {
            release: input.release,
            latestRelease: "v0.3.4",
            changed: 1,
            selected: input.selection.length,
            comparedAt: "2026-09-12T10:00:00.000Z",
          };
        },
      },
    });

    const result = await reader.read(REPO);

    expect(seen).toStrictEqual([["tdd", "grill"]]);
    expect(result).toMatchObject({
      ok: true,
      releaseHead: {
        release: "v0.3.2",
        latestRelease: "v0.3.4",
        changed: 1,
        selected: 2,
        comparedAt: "2026-09-12T10:00:00.000Z",
      },
    });
  });

  it("marks a row whose copy diverged from its baseline as locally edited", async () => {
    const files = [
      ".claude/skills/tdd/SKILL.md",
      ".claude/skills/grill/SKILL.md",
      ".claude/skills/jobs/SKILL.md",
    ];
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(
          rootPackageEntry("v0.3.2", files, ["tdd", "grill", "jobs"]),
        ),
        ...onDisk(REPO, files),
      },
    });
    const reader = new DeployStateReader({
      fs,
      content: {
        classify: async ({ name }) =>
          name === "tdd"
            ? "diverged"
            : name === "grill"
              ? "unverifiable"
              : "clean",
      },
    });

    await expect(reader.read(REPO)).resolves.toEqual({
      ok: true,
      primitives: [
        { type: "skill", name: "tdd", version: "v0.3.2", copy: "local-edits" },
        { type: "skill", name: "grill", version: "v0.3.2", copy: "unverified" },
        { type: "skill", name: "jobs", version: "v0.3.2" },
      ],
      skipped: [],
    });
  });
});

describe("GlobalDeployStateReader on a root-package target", () => {
  it("groups the root package's skills under the tool their files sit in", async () => {
    const files = [
      ".claude/skills/tdd/SKILL.md",
      ".agents/skills/tdd/SKILL.md",
      ".agents/skills/grill/SKILL.md",
    ];
    const fs = new InMemoryFileSystem({
      files: {
        [GLOBAL_LOCKFILE]: lockfile(
          rootPackageEntry("v0.3.2", files, ["tdd", "grill"]),
        ),
        ...onDisk("/home", files),
      },
    });
    const reader = new GlobalDeployStateReader({
      fs,
      toolPresence: fakePresence(["claude", "codex"]),
      treeRoot: () => "/home",
    });

    await expect(reader.readGlobal(GLOBAL_ROOT)).resolves.toEqual({
      ok: true,
      tools: [
        {
          tool: "claude",
          primitives: [{ type: "skill", name: "tdd", version: "v0.3.2" }],
        },
        {
          tool: "codex",
          primitives: [
            { type: "skill", name: "tdd", version: "v0.3.2" },
            { type: "skill", name: "grill", version: "v0.3.2" },
          ],
        },
      ],
      skipped: [],
      otherOrigins: [],
    });
  });

  it("carries a Release head per tool, over that tool's skills", async () => {
    const files = [
      ".claude/skills/tdd/SKILL.md",
      ".agents/skills/tdd/SKILL.md",
      ".agents/skills/grill/SKILL.md",
    ];
    const fs = new InMemoryFileSystem({
      files: {
        [GLOBAL_LOCKFILE]: lockfile(
          rootPackageEntry("v0.3.2", files, ["tdd", "grill"]),
        ),
        ...onDisk("/home", files),
      },
    });
    const reader = new GlobalDeployStateReader({
      fs,
      toolPresence: fakePresence(["claude", "codex"]),
      treeRoot: () => "/home",
      releaseHead: {
        read: async (input) => ({
          release: input.release,
          latestRelease: "v0.3.4",
          changed: input.selection.length,
          selected: input.selection.length,
          comparedAt: "2026-09-12T10:00:00.000Z",
        }),
      },
    });

    const result = await reader.readGlobal(GLOBAL_ROOT);

    expect(result.ok && result.tools.map((group) => group.releaseHead)).toEqual(
      [
        {
          release: "v0.3.2",
          latestRelease: "v0.3.4",
          changed: 1,
          selected: 1,
          comparedAt: "2026-09-12T10:00:00.000Z",
        },
        {
          release: "v0.3.2",
          latestRelease: "v0.3.4",
          changed: 2,
          selected: 2,
          comparedAt: "2026-09-12T10:00:00.000Z",
        },
      ],
    );
  });

  it("leaves a phantom row out of the tool that no longer holds it", async () => {
    const fs = new InMemoryFileSystem({
      files: {
        [GLOBAL_LOCKFILE]: PHANTOM_LOCKFILE,
        ...onDisk("/home", [
          ".agents/skills/alpha/SKILL.md",
          ".claude/skills/alpha/SKILL.md",
        ]),
      },
    });
    const reader = new GlobalDeployStateReader({
      fs,
      toolPresence: fakePresence(["claude", "codex"]),
      treeRoot: () => "/home",
    });

    const result = await reader.readGlobal(GLOBAL_ROOT);

    expect(
      result.ok &&
        result.tools.map((group) =>
          group.primitives.map((primitive) => primitive.name),
        ),
    ).toStrictEqual([["alpha"], ["alpha"]]);
  });
});

// A classifier that reads its own injected state, the way DeployedContentAdapter
// does: a reader calling the method detached loses it and silently chips
// nothing (found in smoke, #949).
class StatefulClassifier {
  private readonly edited: string;

  constructor(edited: string) {
    this.edited = edited;
  }

  async classify(input: { name: string }) {
    return input.name === this.edited
      ? ("diverged" as const)
      : ("clean" as const);
  }
}

describe("DeployStateReader copy chips", () => {
  it("calls the content port as a method, so an adapter keeps its own state", async () => {
    const files = [".claude/skills/tdd/SKILL.md"];
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(rootPackageEntry("v0.3.2", files, ["tdd"])),
        ...onDisk(REPO, files),
      },
    });
    const reader = new DeployStateReader({
      fs,
      content: new StatefulClassifier("tdd"),
    });

    await expect(reader.read(REPO)).resolves.toMatchObject({
      primitives: [
        { type: "skill", name: "tdd", version: "v0.3.2", copy: "local-edits" },
      ],
    });
  });
});

// A per-skill dependency, the shape every target held before ADR-0031: one
// entry per skill, pinned at its own tag under `.apm/skills/<name>`.
function pinnedEntry(name: string, ref: string, prefixes = [".claude"]) {
  const files = prefixes
    .map((prefix) => `  - ${prefix}/skills/${name}/SKILL.md\n`)
    .join("");
  return `- repo_url: fimoklei/agent-harness\n  host: github.com\n  resolved_ref: ${ref}\n  virtual_path: .apm/skills/${name}\n  package_type: claude_skill\n  deployed_files:\n${files}`;
}

const HARNESS_ORIGIN = async () => ({
  host: "github.com",
  ownerRepo: "fimoklei/agent-harness",
});

describe("DeployStateReader on a target pinned per skill", () => {
  it("reads the skills its per-skill dependencies pin, grouped by release", async () => {
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(
          pinnedEntry("tdd", "v0.3.1") +
            pinnedEntry("grill", "v0.3.1") +
            pinnedEntry("jobs", "v0.3.0"),
        ),
      },
    });
    const reader = new DeployStateReader({ fs, harnessOrigin: HARNESS_ORIGIN });

    const result = await reader.read(REPO);

    expect(result).toMatchObject({
      ok: true,
      pinnedPerSkill: [
        { release: "v0.3.1", skills: 2 },
        { release: "v0.3.0", skills: 1 },
      ],
    });
  });

  it("reads no such status from per-skill entries of another Harness", async () => {
    const foreign = `- repo_url: other/harness\n  host: github.com\n  resolved_ref: v1.0.0\n  virtual_path: .apm/skills/tdd\n  package_type: claude_skill\n  deployed_files:\n  - .claude/skills/tdd/SKILL.md\n`;
    const fs = new InMemoryFileSystem({
      files: { [LOCKFILE]: lockfile(foreign) },
    });
    const reader = new DeployStateReader({ fs, harnessOrigin: HARNESS_ORIGIN });

    const result = await reader.read(REPO);

    expect(result).toMatchObject({
      ok: true,
      primitives: [{ type: "skill", name: "tdd", version: "v1.0.0" }],
    });
    expect(
      "pinnedPerSkill" in result ? result.pinnedPerSkill : undefined,
    ).toBeUndefined();
  });

  it("reads no such status while the connected Harness is unknown", async () => {
    const fs = new InMemoryFileSystem({
      files: { [LOCKFILE]: lockfile(pinnedEntry("tdd", "v0.3.1")) },
    });

    const result = await new DeployStateReader({ fs }).read(REPO);

    expect(
      "pinnedPerSkill" in result ? result.pinnedPerSkill : undefined,
    ).toBeUndefined();
  });
});

describe("DeployStateReader on a record holding extra files", () => {
  it("counts the recorded files that belong to no selected skill", async () => {
    const files = [".claude/skills/tdd/SKILL.md", ".claude/agents/review.md"];
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(rootPackageEntry("v0.3.2", files, ["tdd"])),
        ...onDisk(REPO, files),
      },
    });

    const result = await new DeployStateReader({ fs }).read(REPO);

    expect(result).toMatchObject({ ok: true, extraFiles: 1 });
  });

  it("says nothing where every recorded file belongs to a skill", async () => {
    const files = [".claude/skills/tdd/SKILL.md"];
    const fs = new InMemoryFileSystem({
      files: {
        [LOCKFILE]: lockfile(rootPackageEntry("v0.3.2", files, ["tdd"])),
        ...onDisk(REPO, files),
      },
    });

    const result = await new DeployStateReader({ fs }).read(REPO);

    expect(
      "extraFiles" in result ? result.extraFiles : undefined,
    ).toBeUndefined();
  });
});

describe("GlobalDeployStateReader on a target pinned per skill", () => {
  it("reads the status per tool, from that tool's own per-skill entries", async () => {
    const fs = new InMemoryFileSystem({
      files: {
        [GLOBAL_LOCKFILE]: lockfile(
          pinnedEntry("tdd", "v0.3.1", [".claude", ".agents"]) +
            pinnedEntry("grill", "v0.3.0", [".claude"]),
        ),
      },
    });
    const reader = new GlobalDeployStateReader({
      fs,
      toolPresence: fakePresence(["claude", "codex"]),
      treeRoot: () => "/home",
      harnessOrigin: HARNESS_ORIGIN,
    });

    const result = await reader.readGlobal(GLOBAL_ROOT);

    expect(
      result.ok && result.tools.map((group) => group.pinnedPerSkill),
    ).toStrictEqual([
      [
        { release: "v0.3.1", skills: 1 },
        { release: "v0.3.0", skills: 1 },
      ],
      [{ release: "v0.3.1", skills: 1 }],
    ]);
  });

  it("counts extra files per tool, from that tool's own subtree", async () => {
    const files = [
      ".claude/skills/tdd/SKILL.md",
      ".claude/agents/review.md",
      ".agents/skills/tdd/SKILL.md",
    ];
    const fs = new InMemoryFileSystem({
      files: {
        [GLOBAL_LOCKFILE]: lockfile(rootPackageEntry("v0.3.2", files, ["tdd"])),
        ...onDisk("/home", files),
      },
    });
    const reader = new GlobalDeployStateReader({
      fs,
      toolPresence: fakePresence(["claude", "codex"]),
      treeRoot: () => "/home",
    });

    const result = await reader.readGlobal(GLOBAL_ROOT);

    expect(
      result.ok && result.tools.map((group) => group.extraFiles),
    ).toStrictEqual([1, undefined]);
  });
});
