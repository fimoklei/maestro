import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inMemoryDeployedContent } from "../deploy/deployed-content.fake";
import { DEFAULT_GLOBAL_LAYOUT } from "../deploy/global-layout.fake";
import { InMemoryCopyTree } from "../filesystem/copy-tree-fs.fake";
import { DeployedContentAdapter } from "../index";
import {
  DeployStateReader,
  GlobalDeployStateReader,
} from "./deploy-state-reader";

const HOME = "/home";
const HARNESS = "/harness";
const GLOBAL_ROOT = `${HOME}/.apm`;
const LOCKFILE = `${GLOBAL_ROOT}/apm.lock.yaml`;
const FIXTURES = new URL("../../../../tests/fixtures/", import.meta.url);

// apm deployed v1.0.0 to both tools, then v2.0.0 to Claude Code only.
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

const EDIT = "imported edit\n";

function globalWith(options: {
  // Each folder's copy of code-review, edited where set.
  claude?: string;
  agents?: string;
  // The Working harness's code-review, where set; null: no Harness connected.
  harness?: string | null;
  tags?: readonly string[];
}) {
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
  if (options.claude !== undefined) {
    tree.write(`${HOME}/.claude/skills/code-review/SKILL.md`, options.claude);
  }
  if (options.agents !== undefined) {
    tree.write(`${HOME}/.agents/skills/code-review/SKILL.md`, options.agents);
  }
  for (const name of ["code-review", "commit-message"]) {
    tree.write(
      `${HARNESS}/.apm/skills/${name}/SKILL.md`,
      readFileSync(releasedFile("v2.0.0", name)),
    );
  }
  if (typeof options.harness === "string") {
    tree.write(`${HARNESS}/.apm/skills/code-review/SKILL.md`, options.harness);
  }
  const tags = options.tags ?? ["v2.0.0", "v1.1.0", "v1.0.0"];
  const reader = new GlobalDeployStateReader({
    fs: tree.fileSystem(),
    globalLayout: () => DEFAULT_GLOBAL_LAYOUT,
    toolPresence: { detectGlobalTools: async () => ["claude", "codex"] },
    treeRoot: () => HOME,
    content: new DeployedContentAdapter({
      location: {
        treeRoot: () => HOME,
        lockfilePath: () => LOCKFILE,
        toolRoots: () => DEFAULT_GLOBAL_LAYOUT.roots,
      },
      fs: tree,
      inventoryGit: {
        readSkillFilesAtTag: async (tag, name) =>
          tag === "v3.0.0" && typeof options.harness === "string"
            ? { "SKILL.md": sha(options.harness) }
            : released(tag, name),
      },
      workingHarness: async () =>
        options.harness === null ? undefined : HARNESS,
    }),
    releaseTags: async () => tags,
  });
  return { reader, tree };
}

const folderCopies = async (reader: GlobalDeployStateReader) => {
  const result = await reader.readGlobal(GLOBAL_ROOT);
  return result.ok
    ? result.folders.map((folder) => [
        folder.path,
        folder.primitives.find((p) => p.name === "code-review")?.copy,
      ])
    : null;
};

describe("Edits in the Harness on Global", () => {
  it("reads an edited copy the Working harness holds as Edits in the Harness", async () => {
    const { reader } = globalWith({ agents: EDIT, harness: EDIT });

    expect(await folderCopies(reader)).toStrictEqual([
      ["~/.claude/skills", undefined],
      ["~/.agents/skills", "edits-in-harness"],
    ]);
  });

  it("reads the copy as Local edits again once it is edited after the import", async () => {
    const { reader } = globalWith({ agents: "edited again\n", harness: EDIT });

    expect(await folderCopies(reader)).toStrictEqual([
      ["~/.claude/skills", undefined],
      ["~/.agents/skills", "local-edits"],
    ]);
  });

  it("leaves the copy Local edits where no Working harness is connected", async () => {
    const { reader } = globalWith({ agents: EDIT, harness: null });

    expect(await folderCopies(reader)).toStrictEqual([
      ["~/.claude/skills", undefined],
      ["~/.agents/skills", "local-edits"],
    ]);
  });

  it("leaves the copy Local edits where the Working harness's skill cannot be read", async () => {
    const { reader, tree } = globalWith({ agents: EDIT, harness: EDIT });
    tree.remove(`${HARNESS}/.apm/skills/code-review`);
    tree.write(`${HARNESS}/.apm/skills/code-review`, "not a directory\n");

    expect(await folderCopies(reader)).toStrictEqual([
      ["~/.claude/skills", undefined],
      ["~/.agents/skills", "local-edits"],
    ]);
  });

  it("raises no copy reading once a release holds the imported work", async () => {
    const { reader } = globalWith({
      agents: EDIT,
      harness: EDIT,
      tags: ["v3.0.0", "v2.0.0", "v1.1.0", "v1.0.0"],
    });

    expect(await folderCopies(reader)).toStrictEqual([
      ["~/.claude/skills", undefined],
      ["~/.agents/skills", undefined],
    ]);
  });

  it("reads each folder on its own, and the skill list takes the worse reading", async () => {
    const { reader } = globalWith({
      claude: "edited apart\n",
      agents: EDIT,
      harness: EDIT,
    });

    const result = await reader.readGlobal(GLOBAL_ROOT);

    expect(await folderCopies(reader)).toStrictEqual([
      ["~/.claude/skills", "local-edits"],
      ["~/.agents/skills", "edits-in-harness"],
    ]);
    expect(
      result.ok &&
        result.primitives.find((p) => p.name === "code-review")?.copy,
    ).toBe("local-edits");
  });

  it("lets Edits in the Harness outrank a clean folder in the skill list", async () => {
    const { reader } = globalWith({ agents: EDIT, harness: EDIT });

    const result = await reader.readGlobal(GLOBAL_ROOT);

    expect(
      result.ok &&
        result.primitives.find((p) => p.name === "code-review")?.copy,
    ).toBe("edits-in-harness");
  });
});

const REPO = "/repo";

// tdd and grill deployed per skill to a repository at v0.5.1; both diverged.
function repoWith(options: {
  // The Working harness's tdd, where set.
  harness?: string;
  // Each tool's tdd copy, overriding the fake's edit.
  claude?: string;
  codex?: string;
}) {
  const fake = inMemoryDeployedContent({ workingHarness: HARNESS });
  const target = { kind: "repo" as const, repoPath: REPO };
  fake.setCopy(target, "tdd", "diverged");
  fake.setCopy(target, "grill", "diverged");
  if (options.claude !== undefined) {
    fake.editFile(`${REPO}/.claude/skills/tdd/SKILL.md`, options.claude);
  }
  if (options.codex !== undefined) {
    fake.editFile(`${REPO}/.agents/skills/tdd/SKILL.md`, options.codex);
  }
  if (options.harness !== undefined) {
    fake.tree.write(`${HARNESS}/.apm/skills/tdd/SKILL.md`, options.harness);
  }
  fake.tree.write(`${HARNESS}/.apm/skills/grill/SKILL.md`, "grill\n");
  const reader = new DeployStateReader({
    fs: fake.tree.fileSystem(),
    content: fake.content,
  });
  const copies = async () => {
    const result = await reader.read(REPO);
    return result.ok
      ? result.primitives.map((primitive) => [primitive.name, primitive.copy])
      : null;
  };
  return { copies };
}

describe("Edits in the Harness on a repository", () => {
  it("reads an edited copy the Working harness holds as Edits in the Harness", async () => {
    const { copies } = repoWith({ harness: "tdd, edited\n" });

    expect(await copies()).toStrictEqual([
      ["tdd", "edits-in-harness"],
      ["grill", "local-edits"],
    ]);
  });

  it("reads Local edits where one tool's copy differs from the Working harness", async () => {
    const { copies } = repoWith({
      harness: "tdd, edited\n",
      codex: "tdd, edited apart\n",
    });

    expect(await copies()).toStrictEqual([
      ["tdd", "local-edits"],
      ["grill", "local-edits"],
    ]);
  });

  it("ignores a tool copy still equal to its record", async () => {
    const { copies } = repoWith({ harness: "tdd, edited\n", codex: "tdd\n" });

    expect(await copies()).toStrictEqual([
      ["tdd", "edits-in-harness"],
      ["grill", "local-edits"],
    ]);
  });

  it("leaves the copy Local edits where the Working harness lacks the skill", async () => {
    const { copies } = repoWith({});

    expect(await copies()).toStrictEqual([
      ["tdd", "local-edits"],
      ["grill", "local-edits"],
    ]);
  });
});
