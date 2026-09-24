import { execFileSync } from "node:child_process";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changedFiles } from "../../scripts/lib/changed-files.mjs";

describe("changedFiles", () => {
  let repo: string;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, stdio: "ignore" });

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "maestro-changed-"));
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    await writeFile(join(repo, ".gitignore"), "*.log\n");
    await writeFile(join(repo, "a.ts"), "one\n");
    await writeFile(join(repo, "b.ts"), "one\n");
    git("add", ".");
    git("commit", "-qm", "init");
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("lists nothing on a clean tree", () => {
    expect(changedFiles(repo)).toEqual([]);
  });

  it("lists staged, unstaged and untracked files once each", async () => {
    await writeFile(join(repo, "a.ts"), "staged\n");
    git("add", "a.ts");
    await writeFile(join(repo, "a.ts"), "staged, then edited\n");
    await writeFile(join(repo, "b.ts"), "unstaged\n");
    await writeFile(join(repo, "c.ts"), "untracked\n");

    expect(changedFiles(repo).sort()).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("leaves out deleted and ignored files", async () => {
    await unlink(join(repo, "a.ts"));
    git("rm", "-q", "b.ts");
    await writeFile(join(repo, "run.log"), "ignored\n");

    expect(changedFiles(repo)).toEqual([]);
  });

  it("leaves out a staged new file that was deleted from disk", async () => {
    await writeFile(join(repo, "c.ts"), "new\n");
    git("add", "c.ts");
    await unlink(join(repo, "c.ts"));

    expect(changedFiles(repo)).toEqual([]);
  });
});
