// Content at a commit never changes; a tag can move. The reader must honour
// the move at once.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ReleasedContentReader } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";

const run = promisify(execFile);

const IDENTITY = {
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

const TAG = "refs/maestro/tags/v0.1.0";

describe("ReleasedContentReader", { timeout: 30_000 }, () => {
  let root: string;

  const git = async (args: string[]) =>
    (
      await run("git", args, {
        cwd: root,
        env: { ...process.env, ...IDENTITY },
      })
    ).stdout.trim();

  const writeSkill = async (name: string, body: string) => {
    const dir = join(root, ".apm/skills", name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), body);
  };

  const release = async (message: string) => {
    await git(["add", "-A"]);
    await git(["commit", "-m", message]);
    await git(["update-ref", TAG, "HEAD"]);
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maestro-released-content-"));
    await git(["init", "--initial-branch=main", "."]);
    await writeSkill("tdd", "tdd v1\n");
    await writeSkill("workflow-commit", "commit v1\n");
    await release("first release");
  });

  afterEach(async () => {
    await removeGitTempTree(root);
  });

  it("reads the skill trees git reports at a tag", async () => {
    const trees = await new ReleasedContentReader().skillTrees(root, TAG);

    expect(trees).toEqual([
      {
        name: "tdd",
        treeHash: await git(["rev-parse", `${TAG}:.apm/skills/tdd`]),
      },
      {
        name: "workflow-commit",
        treeHash: await git([
          "rev-parse",
          `${TAG}:.apm/skills/workflow-commit`,
        ]),
      },
    ]);
  });

  it("reads the new trees once the tag moves to a new commit", async () => {
    const reader = new ReleasedContentReader();
    const before = await reader.skillTrees(root, TAG);

    await writeSkill("tdd", "tdd v2\n");
    await release("second release");
    const after = await reader.skillTrees(root, TAG);

    expect(after).not.toEqual(before);
    expect(after).toContainEqual({
      name: "tdd",
      treeHash: await git(["rev-parse", `${TAG}:.apm/skills/tdd`]),
    });
  });

  it("reads null for a ref the clone lacks", async () => {
    const trees = await new ReleasedContentReader().skillTrees(
      root,
      "refs/maestro/tags/v9.9.9",
    );

    expect(trees).toBeNull();
  });

  it("reads an empty list at a release without a skills directory", async () => {
    await git(["rm", "-r", "-q", ".apm"]);
    await git(["commit", "-m", "no skills"]);
    await git(["update-ref", TAG, "HEAD"]);

    expect(await new ReleasedContentReader().skillTrees(root, TAG)).toEqual([]);
  });

  it("reads each skill's manifest at a tag, null where it has none", async () => {
    const reader = new ReleasedContentReader();
    const first = await reader.skillManifests(root, TAG, [
      "tdd",
      "workflow-commit",
      "missing",
    ]);

    await writeSkill("tdd", "tdd v2\n");
    await release("second release");
    const second = await reader.skillManifests(root, TAG, ["tdd"]);

    expect(first).toEqual({
      tdd: "tdd v1\n",
      "workflow-commit": "commit v1\n",
      missing: null,
    });
    expect(second).toEqual({ tdd: "tdd v2\n" });
  });

  it("hashes a skill's files at a tag, the way git reports their bytes", async () => {
    await mkdir(join(root, ".apm/skills/tdd/scripts"), { recursive: true });
    await writeFile(
      join(root, ".apm/skills/tdd/scripts/run.sh"),
      "#!/bin/sh\n",
    );
    await release("grow the skill");
    const blobHash = async (path: string) =>
      `sha256:${createHash("sha256")
        .update(
          (
            await run("git", ["show", `${TAG}:.apm/skills/tdd/${path}`], {
              cwd: root,
              encoding: "buffer",
            })
          ).stdout,
        )
        .digest("hex")}`;

    expect(
      await new ReleasedContentReader().skillFiles(root, TAG, "tdd"),
    ).toEqual({
      "SKILL.md": await blobHash("SKILL.md"),
      "scripts/run.sh": await blobHash("scripts/run.sh"),
    });
  });

  it("reads a skill's new files once the tag moves to a new commit", async () => {
    const reader = new ReleasedContentReader();
    const before = await reader.skillFiles(root, TAG, "tdd");

    await writeSkill("tdd", "tdd v2\n");
    await release("second release");
    const after = await reader.skillFiles(root, TAG, "tdd");

    expect(before).toEqual({
      "SKILL.md": `sha256:${createHash("sha256").update("tdd v1\n").digest("hex")}`,
    });
    expect(after).toEqual({
      "SKILL.md": `sha256:${createHash("sha256").update("tdd v2\n").digest("hex")}`,
    });
  });

  it("reads no files for a skill the release lacks, null for a ref the clone lacks", async () => {
    const reader = new ReleasedContentReader();

    expect(await reader.skillFiles(root, TAG, "missing")).toEqual({});
    expect(
      await reader.skillFiles(root, "refs/maestro/tags/v9.9.9", "tdd"),
    ).toBeNull();
  });
});
