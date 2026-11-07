import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InMemoryCopyTree } from "../filesystem/copy-tree-fs.fake";
import { DeployedContentAdapter } from "./deployed-content";
import { FolderOutcomeReader } from "./folder-outcome";

const HOME = "/home";
const LOCKFILE = `${HOME}/.apm/apm.lock.yaml`;
const FIXTURES = new URL("../../../../tests/fixtures/", import.meta.url);

const releasedFile = (tag: string, name: string) =>
  new URL(`fixture-harness/${tag}/.apm/skills/${name}/SKILL.md`, FIXTURES);

const sha = (bytes: Buffer | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const TAGS = ["v2.0.0", "v1.1.0", "v1.0.0"];

// What a write left in each folder: a release's copy, an edit, or nothing.
type Copy = { at: string } | { text: string } | "unreadable";

function written(
  folders: Partial<Record<".claude" | ".agents", Record<string, Copy>>>,
  options: { releaseReadable?: boolean } = {},
) {
  const tree = new InMemoryCopyTree();
  for (const [prefix, copies] of Object.entries(folders)) {
    for (const [name, copy] of Object.entries(copies ?? {})) {
      const dir = `${HOME}/${prefix}/skills/${name}`;
      if (copy === "unreadable") {
        tree.write(`${dir}/SKILL.md`, "unread\n");
        tree.setUnreadable(`${dir}/SKILL.md`);
      } else {
        tree.write(
          `${dir}/SKILL.md`,
          "at" in copy ? readFileSync(releasedFile(copy.at, name)) : copy.text,
        );
      }
    }
  }
  const content = new DeployedContentAdapter({
    location: { treeRoot: () => HOME, lockfilePath: () => LOCKFILE },
    fs: tree,
    inventoryGit: {
      readSkillFilesAtTag: async (tag, name) => {
        const file = releasedFile(tag, name);
        return options.releaseReadable === false || !existsSync(file)
          ? null
          : { "SKILL.md": sha(readFileSync(file)) };
      },
    },
  });
  return new FolderOutcomeReader({
    content,
    releaseTags: async () => TAGS,
  });
}

describe("FolderOutcomeReader after a Global write", () => {
  it("reads a copy equal to the release as written in every folder", async () => {
    const reader = written({
      ".claude": { "code-review": { at: "v2.0.0" } },
      ".agents": { "code-review": { at: "v2.0.0" } },
    });

    const outcome = await reader.read({
      release: "v2.0.0",
      names: ["code-review"],
      written: ["claude", "codex"],
    });

    expect(outcome).toEqual({
      release: "v2.0.0",
      folders: [
        {
          path: "~/.claude/skills",
          tool: "claude",
          detected: true,
          skills: [{ name: "code-review", outcome: "written" }],
        },
        {
          path: "~/.agents/skills",
          tool: "codex",
          detected: true,
          skills: [{ name: "code-review", outcome: "written" }],
        },
      ],
    });
  });

  it("reads a folder without the skill's files as missing", async () => {
    const reader = written({
      ".claude": { "code-review": { at: "v2.0.0" } },
    });

    const outcome = await reader.read({
      release: "v2.0.0",
      names: ["code-review"],
      written: ["claude", "codex"],
    });

    expect(outcome.folders[1]?.skills).toEqual([
      { name: "code-review", outcome: "missing" },
    ]);
  });

  it("reads a copy at an older release as not updated, naming that release", async () => {
    const reader = written({
      ".claude": { "code-review": { at: "v1.1.0" } },
    });

    const outcome = await reader.read({
      release: "v2.0.0",
      names: ["code-review"],
      written: ["claude"],
    });

    expect(outcome.folders[0]?.skills).toEqual([
      { name: "code-review", outcome: "not-updated", stillAt: "v1.1.0" },
    ]);
  });

  it("reads a copy whose files exist but differ from every release as not updated", async () => {
    const reader = written({
      ".claude": { "code-review": { text: "edited\n" } },
    });

    const outcome = await reader.read({
      release: "v2.0.0",
      names: ["code-review"],
      written: ["claude"],
    });

    expect(outcome.folders[0]?.skills).toEqual([
      { name: "code-review", outcome: "not-updated", stillAt: null },
    ]);
  });

  it("reads a copy it cannot read as not confirmed", async () => {
    const reader = written({
      ".claude": { "code-review": "unreadable" },
    });

    const outcome = await reader.read({
      release: "v2.0.0",
      names: ["code-review"],
      written: ["claude"],
    });

    expect(outcome.folders[0]?.skills).toEqual([
      { name: "code-review", outcome: "not-confirmed" },
    ]);
  });

  it("reads every copy as not confirmed when the release cannot be read", async () => {
    const reader = written(
      { ".claude": { "code-review": { at: "v2.0.0" } } },
      { releaseReadable: false },
    );

    const outcome = await reader.read({
      release: "v2.0.0",
      names: ["code-review"],
      written: ["claude"],
    });

    expect(outcome.folders[0]?.skills).toEqual([
      { name: "code-review", outcome: "not-confirmed" },
    ]);
  });

  it("lists a folder the write skipped without reading it", async () => {
    const reader = written({
      ".claude": { "code-review": { at: "v2.0.0" } },
      ".agents": { "code-review": { at: "v1.0.0" } },
    });

    const outcome = await reader.read({
      release: "v2.0.0",
      names: ["code-review"],
      written: ["claude"],
    });

    expect(outcome.folders[1]).toEqual({
      path: "~/.agents/skills",
      tool: "codex",
      detected: false,
      skills: [],
    });
  });
});
