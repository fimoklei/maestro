// The remote is a bare repo on disk, so the whole suite is offline.
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { HarnessGitAdapter, ReleasedContentReader } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";

const run = promisify(execFile);

const PROMPT = { type: "prompt", name: "pr-review" } as const;

describe("Harness primitives by type", { timeout: 30_000 }, () => {
  let base: string;
  let remote: string;
  let root: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  const adapter = () =>
    new HarnessGitAdapter({ released: new ReleasedContentReader() });

  const writeSkill = async (name: string) => {
    await mkdir(join(root, ".apm", "skills", name), { recursive: true });
    await writeFile(
      join(root, ".apm", "skills", name, "SKILL.md"),
      `---\ndescription: ${name}\n---\n`,
      "utf8",
    );
  };

  const writePrompt = async (file: string, text: string) => {
    await mkdir(join(root, ".maestro", "prompts"), { recursive: true });
    await writeFile(join(root, ".maestro", "prompts", file), text, "utf8");
  };

  const commitAll = async (message: string) => {
    await git(root, "add", "-A", ".");
    await git(root, "commit", "-m", message);
  };

  const names = (objects: { type: string; name: string }[] | null) =>
    objects === null
      ? null
      : objects.map((object) => `${object.type}:${object.name}`).sort();

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-harness-primitives-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
    await run("git", ["init", "--bare", "-b", "main", remote]);
    await git(remote, "config", "user.email", "remote@example.com");
    await git(remote, "config", "user.name", "Remote");
    await run("git", ["clone", remote, root]);
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    await writeSkill("tdd");
    await commitAll("first skill");
    await git(root, "tag", "v0.1.0");
    await git(root, "push", "--tags", "origin", "HEAD:main");
    await adapter().fetch(root);
  }, 30_000);

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  it("reads a Harness with no prompts folder as zero prompts at a ref, at a tag and on disk", async () => {
    const git = adapter();

    expect(names(await git.readPrimitives(root, "HEAD"))).toEqual([
      "skill:tdd",
    ]);
    expect(names(await git.readPrimitivesAtTag(root, "v0.1.0"))).toEqual([
      "skill:tdd",
    ]);
    const trees = await git.readMovementTrees(root);
    expect(trees?.prompt).toEqual({
      remote: {},
      promote: {},
      local: {},
      working: {},
    });
    expect(Object.keys(trees?.skill.working ?? {})).toEqual(["tdd"]);
  });

  it("still reads an unresolvable ref as unread, never as empty", async () => {
    expect(await adapter().readPrimitives(root, "no-such-ref")).toBeNull();
  });

  it("lists only markdown files directly in the prompts folder, keeping a badly named one", async () => {
    await writePrompt("pr-review.md", "Review $ARGUMENTS\n");
    await writePrompt("Bad Name.md", "text\n");
    await writePrompt("notes.txt", "not a prompt\n");
    await mkdir(join(root, ".maestro", "prompts", "nested.md"));
    await writeFile(
      join(root, ".maestro", "prompts", "nested.md", "inner.md"),
      "x\n",
    );
    await symlink("pr-review.md", join(root, ".maestro", "prompts", "link.md"));
    await commitAll("prompts");

    expect(names(await adapter().readPrimitives(root, "HEAD"))).toEqual([
      "prompt:Bad Name",
      "prompt:pr-review",
      "skill:tdd",
    ]);
  });

  it("reads a prompt deleted from disk as gone from the working listing", async () => {
    await writePrompt("pr-review.md", "Review\n");
    await commitAll("prompt");
    await rm(join(root, ".maestro"), { recursive: true });

    const trees = await adapter().readMovementTrees(root);

    expect(Object.keys(trees?.prompt.local ?? {})).toEqual(["pr-review"]);
    expect(trees?.prompt.working).toEqual({});
  });

  it("pushes a prompt to its own branch as one file, never read as a skill", async () => {
    await writePrompt("pr-review.md", "Review $ARGUMENTS\n");
    const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();

    await expect(
      adapter().pushPromotion(root, PROMPT, head, "addition"),
    ).resolves.toBe("pushed");
    await adapter().fetch(root);

    const shown = await git(
      remote,
      "show",
      "maestro/prompt.pr-review:.maestro/prompts/pr-review.md",
    );
    expect(shown.stdout).toBe("Review $ARGUMENTS\n");
    const subject = await git(
      remote,
      "log",
      "-1",
      "--format=%s",
      "maestro/prompt.pr-review",
    );
    expect(subject.stdout.trim()).toBe("Add prompt: pr-review");
    const trees = await adapter().readMovementTrees(root);
    expect(Object.keys(trees?.prompt.promote ?? {})).toEqual(["pr-review"]);
    expect(trees?.skill.promote).toEqual({});
  });

  it("writes a committed prompt file into a folder byte for byte", async () => {
    await writePrompt("pr-review.md", "Review [PR LINK] and $1\n");
    await commitAll("prompt");
    const head = (await git(root, "rev-parse", "HEAD")).stdout.trim();
    const into = join(base, "staging");
    await mkdir(into);

    await expect(
      adapter().writePrimitiveInto(root, PROMPT, head, into),
    ).resolves.toBe("written");

    expect(await readFile(join(into, "pr-review.md"), "utf8")).toBe(
      "Review [PR LINK] and $1\n",
    );
  });
});
