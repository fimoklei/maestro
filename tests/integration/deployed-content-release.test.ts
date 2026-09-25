// A copy that equals the chosen release in full is not local edits (#952);
// every other shape keeps the copy protected.
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeployedContentAdapter } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sha = (contents: string) =>
  `sha256:${createHash("sha256").update(contents).digest("hex")}`;

const SUBTREES = [".claude/skills/tdd", ".agents/skills/tdd"];

describe("DeployedContentAdapter, against the chosen release", () => {
  let root: string;
  let asked: { tag: string; name: string }[];

  const adapter = (files: Record<string, string> | null) => {
    asked = [];
    return new DeployedContentAdapter({
      location: {
        treeRoot: () => root,
        lockfilePath: () => join(root, "apm.lock.yaml"),
      },
      inventoryGit: {
        readSkillFilesAtTag: async (tag, name) => {
          asked.push({ tag, name });
          return files;
        },
      },
    });
  };

  const writeDeployed = async (relPath: string, contents: string) => {
    const abs = join(root, relPath);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, contents);
  };

  const writeLockfile = async (hashes: Record<string, string>) => {
    const recorded = Object.entries(hashes);
    const yaml = [
      "dependencies:",
      "  - virtual_path: .apm/skills/tdd",
      "    package_type: claude_skill",
      "    resolved_ref: v0.5.1",
      ...(recorded.length === 0
        ? []
        : [
            "    deployed_file_hashes:",
            ...recorded.map(([path, hash]) => `      ${path}: ${hash}`),
          ]),
      "",
    ].join("\n");
    await writeFile(join(root, "apm.lock.yaml"), yaml, "utf8");
  };

  const deployEverywhere = async (files: Record<string, string>) => {
    for (const subtree of SUBTREES) {
      for (const [path, contents] of Object.entries(files)) {
        await writeDeployed(`${subtree}/${path}`, contents);
      }
    }
  };

  const recordOf = (files: Record<string, string>) =>
    Object.fromEntries(
      SUBTREES.flatMap((subtree) =>
        Object.entries(files).map(([path, contents]) => [
          `${subtree}/${path}`,
          sha(contents),
        ]),
      ),
    );

  const classify = (files: Record<string, string> | null, release?: string) =>
    adapter(files).classify({
      target: { kind: "repo", repoPath: root },
      name: "tdd",
      ...(release === undefined ? {} : { release }),
    });

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maestro-release-guard-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("reads a copy equal in full to the chosen release as clean", async () => {
    await writeLockfile(recordOf({ "SKILL.md": "old" }));
    await deployEverywhere({ "SKILL.md": "new" });

    await expect(classify({ "SKILL.md": sha("new") }, "v0.6.0")).resolves.toBe(
      "clean",
    );
  });

  it("never reads the release for a copy that matches its record", async () => {
    await writeLockfile(recordOf({ "SKILL.md": "same" }));
    await deployEverywhere({ "SKILL.md": "same" });

    await expect(classify(null, "v0.6.0")).resolves.toBe("clean");
    expect(asked).toEqual([]);
  });

  it("keeps a copy with a file the release does not have protected", async () => {
    await writeLockfile(recordOf({ "SKILL.md": "old" }));
    await deployEverywhere({ "SKILL.md": "new", "notes.md": "mine" });

    await expect(classify({ "SKILL.md": sha("new") }, "v0.6.0")).resolves.toBe(
      "diverged",
    );
  });

  it("keeps a copy missing a file the release has protected", async () => {
    await writeLockfile(recordOf({ "SKILL.md": "old" }));
    await deployEverywhere({ "SKILL.md": "new" });

    await expect(
      classify({ "SKILL.md": sha("new"), "guide.md": sha("also") }, "v0.6.0"),
    ).resolves.toBe("diverged");
  });

  it("keeps the copy protected when the release cannot be read", async () => {
    await writeLockfile(recordOf({ "SKILL.md": "old" }));
    await deployEverywhere({ "SKILL.md": "new" });

    await expect(classify(null, "v0.6.0")).resolves.toBe("diverged");
    expect(asked).toEqual([{ tag: "v0.6.0", name: "tdd" }]);
  });

  it("keeps the copy protected when no release was chosen", async () => {
    await writeLockfile(recordOf({ "SKILL.md": "old" }));
    await deployEverywhere({ "SKILL.md": "new" });

    await expect(classify({ "SKILL.md": sha("new") })).resolves.toBe(
      "diverged",
    );
    expect(asked).toEqual([]);
  });

  it("keeps one tool's edited copy protected when the other matches", async () => {
    await writeLockfile(recordOf({ "SKILL.md": "old" }));
    await deployEverywhere({ "SKILL.md": "new" });
    await writeDeployed(".agents/skills/tdd/SKILL.md", "edited by hand");

    await expect(classify({ "SKILL.md": sha("new") }, "v0.6.0")).resolves.toBe(
      "diverged",
    );
  });

  it("reads a copy with no recorded hashes as unverifiable, release or not", async () => {
    await writeLockfile({});
    await deployEverywhere({ "SKILL.md": "new" });

    await expect(classify({ "SKILL.md": sha("new") }, "v0.6.0")).resolves.toBe(
      "unverifiable",
    );
  });

  it("scopes the comparison to the tools the write targets", async () => {
    await writeLockfile(recordOf({ "SKILL.md": "old" }));
    await deployEverywhere({ "SKILL.md": "new" });
    await writeDeployed(".agents/skills/tdd/SKILL.md", "edited by hand");

    await expect(
      adapter({ "SKILL.md": sha("new") }).classify({
        target: { kind: "repo", repoPath: root },
        name: "tdd",
        tools: ["claude"],
        release: "v0.6.0",
      }),
    ).resolves.toBe("clean");
  });
});
