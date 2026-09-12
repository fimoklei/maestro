import { describe, expect, it } from "vitest";
import { readTargetSelection } from "./target-selection";

const origin = { host: "github.com", ownerRepo: "fimoklei/agent-harness" };

const rootLock = (release: string, files: string[]) => `dependencies:
- repo_url: fimoklei/agent-harness
  host: github.com
  resolved_ref: ${release}
  package_type: apm_package
  deployed_files:
${files.map((file) => `  - ${file}`).join("\n")}
  skill_subset:
  - caveman
  - prototype
`;

const reader = (lock: string | null, present: string[] = []) => ({
  fs: {
    readFile: async () => lock,
    isFileEntry: async (path: string) =>
      present.some((file) => path.endsWith(file)),
  },
  location: {
    lockfilePath: () => "/repo/apm.lock.yaml",
    treeRoot: () => "/repo",
  },
  target: { kind: "repo", repoPath: "/repo" } as const,
  origin,
});

describe("readTargetSelection", () => {
  it("reads a target with no lockfile as empty", async () => {
    expect(await readTargetSelection(reader(null))).toEqual({ kind: "empty" });
  });

  it("reads the release, the ref and the deployed selection of a root package", async () => {
    const lock = rootLock("v0.6.0", [
      ".claude/skills/prototype",
      ".claude/skills/prototype/SKILL.md",
      ".claude/skills/caveman/SKILL.md",
    ]);
    expect(
      await readTargetSelection(
        reader(lock, [
          ".claude/skills/prototype/SKILL.md",
          ".claude/skills/caveman/SKILL.md",
        ]),
      ),
    ).toEqual({
      kind: "root",
      release: "v0.6.0",
      ref: "github.com/fimoklei/agent-harness#v0.6.0",
      deployed: ["prototype", "caveman"],
    });
  });

  it("leaves out a recorded skill with no file on disk", async () => {
    const lock = rootLock("v0.6.0", [
      ".claude/skills/prototype/SKILL.md",
      ".claude/skills/caveman/SKILL.md",
    ]);
    const result = await readTargetSelection(
      reader(lock, [".claude/skills/prototype/SKILL.md"]),
    );
    expect(result).toMatchObject({ kind: "root", deployed: ["prototype"] });
  });

  it("reads a target holding per-skill dependencies as pinned per skill", async () => {
    const lock = `dependencies:
- repo_url: fimoklei/agent-harness
  host: github.com
  resolved_ref: v0.5.0
  virtual_path: .apm/skills/tdd
  package_type: claude_skill
`;
    expect(await readTargetSelection(reader(lock))).toEqual({
      kind: "pinned-per-skill",
    });
  });

  it("ignores a per-skill dependency from another origin", async () => {
    const lock = `dependencies:
- repo_url: other/repo
  host: github.com
  resolved_ref: v0.5.0
  virtual_path: .apm/skills/tdd
  package_type: claude_skill
`;
    expect(await readTargetSelection(reader(lock))).toEqual({ kind: "empty" });
  });

  it("refuses a malformed lockfile rather than reading it as empty", async () => {
    expect(await readTargetSelection(reader("dependencies: [\n"))).toEqual({
      kind: "unreadable",
      reason: "lockfile-malformed",
    });
  });

  it("refuses an entry it could not read at all", async () => {
    const lock = `dependencies:
- package_type: claude_skill
`;
    expect(await readTargetSelection(reader(lock))).toEqual({
      kind: "unreadable",
      reason: "lockfile-malformed",
    });
  });

  it("refuses two root packages on the connected Harness", async () => {
    const lock = `${rootLock("v0.6.0", [".claude/skills/prototype/SKILL.md"])}${rootLock(
      "v0.5.0",
      [".claude/skills/caveman/SKILL.md"],
    ).replace("dependencies:\n", "")}`;
    expect(await readTargetSelection(reader(lock))).toEqual({
      kind: "unreadable",
      reason: "ref-unresolvable",
    });
  });

  it("refuses a root package whose release is not a published tag", async () => {
    const lock = rootLock("main", [".claude/skills/prototype/SKILL.md"]);
    expect(
      await readTargetSelection(reader(lock, ["prototype/SKILL.md"])),
    ).toEqual({ kind: "unreadable", reason: "ref-unresolvable" });
  });
});
