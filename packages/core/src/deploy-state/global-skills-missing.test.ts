import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InMemoryCopyTree } from "../filesystem/copy-tree-fs.fake";
import { DeployedContentAdapter } from "../index";
import { GlobalDeployStateReader } from "./deploy-state-reader";

const HOME = "/home";
const GLOBAL_ROOT = `${HOME}/.apm`;
const LOCKFILE = `${GLOBAL_ROOT}/apm.lock.yaml`;
const FIXTURES = new URL("../../../../tests/fixtures/", import.meta.url);
const SKILLS = ["code-review", "commit-message"];

const releasedBytes = (tag: string, name: string) =>
  readFileSync(
    new URL(`fixture-harness/${tag}/.apm/skills/${name}/SKILL.md`, FIXTURES),
  );

const sha = (bytes: Buffer) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

// Global deployed v2.0.0 to Claude Code only; Codex was installed after.
const CLAUDE_ONLY = [
  "lockfile_version: '1'",
  "dependencies:",
  "- repo_url: fimoklei/maestro-fixture-harness",
  "  host: github.com",
  "  resolved_ref: v2.0.0",
  "  package_type: apm_package",
  "  deployed_files:",
  ...SKILLS.map((name) => `  - .claude/skills/${name}/SKILL.md`),
  "  deployed_file_hashes:",
  ...SKILLS.map(
    (name) =>
      `    .claude/skills/${name}/SKILL.md: ${sha(releasedBytes("v2.0.0", name))}`,
  ),
  "",
].join("\n");

function globalRead(lockfile: string, onDisk: Record<string, string[]>) {
  const tree = new InMemoryCopyTree();
  tree.write(LOCKFILE, lockfile);
  for (const [folder, names] of Object.entries(onDisk)) {
    for (const name of names) {
      tree.write(
        `${HOME}/${folder}/skills/${name}/SKILL.md`,
        releasedBytes("v2.0.0", name),
      );
    }
  }
  return new GlobalDeployStateReader({
    fs: tree.fileSystem(),
    toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
    treeRoot: () => HOME,
    content: new DeployedContentAdapter({
      location: { treeRoot: () => HOME, lockfilePath: () => LOCKFILE },
      fs: tree,
      inventoryGit: {
        readSkillFilesAtTag: async (tag, name) => ({
          "SKILL.md": sha(releasedBytes(tag, name)),
        }),
      },
    }),
    releaseTags: async () => ["v2.0.0"],
  }).readGlobal(GLOBAL_ROOT);
}

describe("GlobalDeployStateReader on a detected folder that lacks skills", () => {
  it("names every Selection skill a newly detected tool's folder lacks", async () => {
    const result = await globalRead(CLAUDE_ONLY, { ".claude": SKILLS });

    expect(
      result.ok &&
        result.folders.map((folder) => [folder.path, folder.missing]),
    ).toStrictEqual([
      ["~/.claude/skills", undefined],
      ["~/.agents/skills", ["code-review", "commit-message"]],
    ]);
  });

  it("names a recorded copy whose files are gone", async () => {
    const both = CLAUDE_ONLY.replace(
      "  deployed_files:\n",
      "  deployed_files:\n  - .agents/skills/code-review/SKILL.md\n  - .agents/skills/commit-message/SKILL.md\n",
    );
    const result = await globalRead(both, {
      ".claude": SKILLS,
      ".agents": ["commit-message"],
    });

    expect(result.ok && result.folders[1]?.missing).toStrictEqual([
      "code-review",
    ]);
  });

  it("keeps Global's one skill list whole", async () => {
    const result = await globalRead(CLAUDE_ONLY, { ".claude": SKILLS });

    expect(
      result.ok && result.primitives.map((primitive) => primitive.name),
    ).toStrictEqual(SKILLS);
  });

  it("names nothing missing in a folder whose tool is not detected", async () => {
    const tree = new InMemoryCopyTree();
    tree.write(LOCKFILE, CLAUDE_ONLY);
    for (const name of SKILLS) {
      tree.write(
        `${HOME}/.claude/skills/${name}/SKILL.md`,
        releasedBytes("v2.0.0", name),
      );
    }
    const result = await new GlobalDeployStateReader({
      fs: tree.fileSystem(),
      toolPresence: { detectGlobalTools: async () => ["claude"] },
      treeRoot: () => HOME,
      content: new DeployedContentAdapter({
        location: { treeRoot: () => HOME, lockfilePath: () => LOCKFILE },
        fs: tree,
      }),
    }).readGlobal(GLOBAL_ROOT);

    expect(result.ok && result.folders[1]?.missing).toBeUndefined();
  });
});
