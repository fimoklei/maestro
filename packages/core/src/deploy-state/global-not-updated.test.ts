import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InMemoryCopyTree } from "../filesystem/copy-tree-fs.fake";
import { DeployedContentAdapter } from "../index";
import { GlobalDeployStateReader } from "./deploy-state-reader";

const HOME = "/home";
const GLOBAL_ROOT = `${HOME}/.apm`;
const LOCKFILE = `${GLOBAL_ROOT}/apm.lock.yaml`;
const FIXTURES = new URL("../../../../tests/fixtures/", import.meta.url);

// The lockfile apm wrote after v1.0.0 to both tools, then v2.0.0 to Claude
// Code only: the .agents copies stay at v1.0.0 under a v2.0.0 resolved_ref.
const NARROWED = readFileSync(
  new URL("apm.lock.1799-narrowed-global.yaml", FIXTURES),
  "utf8",
);

const releasedFile = (tag: string, name: string) =>
  new URL(`fixture-harness/${tag}/.apm/skills/${name}/SKILL.md`, FIXTURES);

const sha = (bytes: Buffer | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

// The fixture Harness's skill at a tag, hashed as the git reader hashes it.
function released(tag: string, name: string): Record<string, string> | null {
  const file = releasedFile(tag, name);
  return existsSync(file) ? { "SKILL.md": sha(readFileSync(file)) } : null;
}

const TAGS = ["v2.0.0", "v1.1.0", "v1.0.0"];

function narrowedGlobal(
  options: { tags?: readonly string[] | null; edit?: string } = {},
) {
  const tree = new InMemoryCopyTree();
  tree.write(LOCKFILE, NARROWED);
  for (const name of ["code-review", "commit-message"]) {
    tree.write(
      `${HOME}/.claude/skills/${name}/SKILL.md`,
      readFileSync(releasedFile("v2.0.0", name)),
    );
    tree.write(
      `${HOME}/.agents/skills/${name}/SKILL.md`,
      readFileSync(releasedFile("v1.0.0", name)),
    );
  }
  if (options.edit !== undefined) {
    tree.write(`${HOME}/.agents/skills/${options.edit}/SKILL.md`, "edited\n");
  }
  const treeReads: string[] = [];
  const reader = new GlobalDeployStateReader({
    fs: tree.fileSystem(),
    toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
    treeRoot: () => HOME,
    content: new DeployedContentAdapter({
      location: { treeRoot: () => HOME, lockfilePath: () => LOCKFILE },
      fs: tree,
      inventoryGit: {
        readSkillFilesAtTag: async (tag, name) => {
          treeReads.push(`${tag} ${name}`);
          return released(tag, name);
        },
      },
    }),
    releaseTags: async () => (options.tags === undefined ? TAGS : options.tags),
  });
  return { reader, treeReads };
}

describe("GlobalDeployStateReader on a folder left at an older release", () => {
  it("names the release each unedited copy is still at", async () => {
    const { reader } = narrowedGlobal();

    const result = await reader.readGlobal(GLOBAL_ROOT);

    expect(
      result.ok &&
        result.folders.map((folder) => [folder.path, folder.notUpdated]),
    ).toStrictEqual([
      ["~/.claude/skills", undefined],
      [
        "~/.agents/skills",
        [
          { name: "code-review", stillAt: "v1.1.0" },
          { name: "commit-message", stillAt: "v1.0.0" },
        ],
      ],
    ]);
  });

  it("marks no copy as edited when it only lags the Target release", async () => {
    const { reader } = narrowedGlobal();

    const result = await reader.readGlobal(GLOBAL_ROOT);

    expect(
      result.ok && result.primitives.map((primitive) => primitive.copy),
    ).toStrictEqual([undefined, undefined]);
  });

  it("names no release where no older tag holds the copy", async () => {
    const { reader } = narrowedGlobal({ tags: ["v2.0.0"] });

    const result = await reader.readGlobal(GLOBAL_ROOT);

    expect(result.ok && result.folders[1]?.notUpdated).toStrictEqual([
      { name: "code-review", stillAt: null },
      { name: "commit-message", stillAt: null },
    ]);
  });

  it("names no release where the tag list could not be read", async () => {
    const tree = narrowedGlobal({ tags: null });

    const result = await tree.reader.readGlobal(GLOBAL_ROOT);

    expect(result.ok && result.folders[1]?.notUpdated).toStrictEqual([
      { name: "code-review", stillAt: null },
      { name: "commit-message", stillAt: null },
    ]);
  });

  it("reads a copy that differs from its record as Local edits, as before", async () => {
    const { reader } = narrowedGlobal({ edit: "code-review" });

    const result = await reader.readGlobal(GLOBAL_ROOT);

    expect(result.ok && result.folders[1]?.notUpdated).toStrictEqual([
      { name: "commit-message", stillAt: "v1.0.0" },
    ]);
    expect(
      result.ok && result.folders[1]?.primitives.map((p) => [p.name, p.copy]),
    ).toStrictEqual([
      ["code-review", "local-edits"],
      ["commit-message", undefined],
    ]);
  });

  it("reads each release tree of a skill at most once per read", async () => {
    const { reader, treeReads } = narrowedGlobal();

    await reader.readGlobal(GLOBAL_ROOT);

    expect(treeReads.length).toBeGreaterThan(0);
    expect(new Set(treeReads).size).toBe(treeReads.length);
  });
});
