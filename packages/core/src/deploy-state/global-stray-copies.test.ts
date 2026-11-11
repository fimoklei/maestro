import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_GLOBAL_LAYOUT } from "../deploy/global-layout.fake";
import { InMemoryCopyTree } from "../filesystem/copy-tree-fs.fake";
import { DeployedContentAdapter, type SupportedTool } from "../index";
import { GlobalDeployStateReader } from "./deploy-state-reader";

const HOME = "/home";
const GLOBAL_ROOT = `${HOME}/.apm`;
const LOCKFILE = `${GLOBAL_ROOT}/apm.lock.yaml`;
const FIXTURES = new URL("../../../../tests/fixtures/", import.meta.url);

// v1.0.0 to both tools, then v2.0.0 to Claude Code only: the .agents copies
// stay at v1.0.0, as on a machine where Codex is no longer detected.
const NARROWED = readFileSync(
  new URL("apm.lock.1799-narrowed-global.yaml", FIXTURES),
  "utf8",
);

const releasedFile = (tag: string, name: string) =>
  new URL(`fixture-harness/${tag}/.apm/skills/${name}/SKILL.md`, FIXTURES);

const sha = (bytes: Buffer | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function released(tag: string, name: string): Record<string, string> | null {
  const file = releasedFile(tag, name);
  return existsSync(file) ? { "SKILL.md": sha(readFileSync(file)) } : null;
}

const SKILLS = ["code-review", "commit-message"];

type Copies = Partial<Record<string, string | null>>;

// `agents`: the release each .agents copy holds, null for no copy there.
function claudeOnlyGlobal(
  options: {
    agents?: Copies;
    detected?: SupportedTool[];
    claudeMissing?: string;
  } = {},
) {
  const tree = new InMemoryCopyTree();
  tree.write(LOCKFILE, NARROWED);
  for (const name of SKILLS) {
    if (name !== options.claudeMissing) {
      tree.write(
        `${HOME}/.claude/skills/${name}/SKILL.md`,
        readFileSync(releasedFile("v2.0.0", name)),
      );
    }
    const agents =
      options.agents === undefined ? "v1.0.0" : options.agents[name];
    if (agents !== null && agents !== undefined) {
      tree.write(
        `${HOME}/.agents/skills/${name}/SKILL.md`,
        readFileSync(releasedFile(agents, name)),
      );
    }
  }
  return new GlobalDeployStateReader({
    fs: tree.fileSystem(),
    globalLayout: () => DEFAULT_GLOBAL_LAYOUT,
    toolPresence: {
      detectGlobalTools: async () => options.detected ?? ["claude"],
    },
    treeRoot: () => HOME,
    content: new DeployedContentAdapter({
      location: {
        treeRoot: () => HOME,
        lockfilePath: () => LOCKFILE,
        toolRoots: () => DEFAULT_GLOBAL_LAYOUT.roots,
      },
      fs: tree,
      inventoryGit: {
        readSkillFilesAtTag: async (tag, name) => released(tag, name),
      },
    }),
    releaseTags: async () => ["v2.0.0", "v1.1.0", "v1.0.0"],
  });
}

const strayCopies = async (reader: GlobalDeployStateReader) => {
  const result = await reader.readGlobal(GLOBAL_ROOT);
  return (
    result.ok &&
    result.folders.map((folder) => [folder.path, folder.strayCopies])
  );
};

describe("GlobalDeployStateReader on an undetected tool's folder", () => {
  it("names each Selection skill with a copy there, and that it differs from the Target release", async () => {
    expect(await strayCopies(claudeOnlyGlobal())).toStrictEqual([
      ["~/.claude/skills", undefined],
      [
        "~/.agents/skills",
        [
          { name: "code-review", atRelease: false },
          { name: "commit-message", atRelease: false },
        ],
      ],
    ]);
  });

  it("reads a copy equal to the Target release as at the release", async () => {
    const reader = claudeOnlyGlobal({
      agents: { "code-review": "v2.0.0", "commit-message": "v1.0.0" },
    });

    expect(await strayCopies(reader)).toStrictEqual([
      ["~/.claude/skills", undefined],
      [
        "~/.agents/skills",
        [
          { name: "code-review", atRelease: true },
          { name: "commit-message", atRelease: false },
        ],
      ],
    ]);
  });

  it("names no skill whose folder there is gone", async () => {
    const reader = claudeOnlyGlobal({
      agents: { "code-review": null, "commit-message": "v1.0.0" },
    });

    expect(await strayCopies(reader)).toStrictEqual([
      ["~/.claude/skills", undefined],
      ["~/.agents/skills", [{ name: "commit-message", atRelease: false }]],
    ]);
  });

  it("names no skill without a copy in a folder Global writes", async () => {
    const reader = claudeOnlyGlobal({ claudeMissing: "code-review" });

    expect(await strayCopies(reader)).toStrictEqual([
      ["~/.claude/skills", undefined],
      ["~/.agents/skills", [{ name: "commit-message", atRelease: false }]],
    ]);
  });

  it("names nothing where the folder holds no copy", async () => {
    const reader = claudeOnlyGlobal({
      agents: { "code-review": null, "commit-message": null },
    });

    expect(await strayCopies(reader)).toStrictEqual([
      ["~/.claude/skills", undefined],
      ["~/.agents/skills", undefined],
    ]);
  });

  it("reads no stray copy in a folder Global writes", async () => {
    const reader = claudeOnlyGlobal({ detected: ["claude", "codex"] });

    expect(await strayCopies(reader)).toStrictEqual([
      ["~/.claude/skills", undefined],
      ["~/.agents/skills", undefined],
    ]);
  });
});
