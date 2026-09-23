import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { treeFingerprint } from "../../scripts/verify-reuse.mjs";

describe("treeFingerprint", () => {
  let repo: string;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, stdio: "ignore" });

  beforeEach(async () => {
    repo = await mkdtemp(join(tmpdir(), "maestro-verify-"));
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    await writeFile(join(repo, ".gitignore"), "*.log\n");
    await writeFile(join(repo, "a.txt"), "one\n");
    git("add", ".");
    git("commit", "-qm", "init");
  });

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("stays the same on an unchanged tree", () => {
    expect(treeFingerprint(repo)).toBe(treeFingerprint(repo));
  });

  it("changes on a new commit", () => {
    const before = treeFingerprint(repo);
    git("commit", "-q", "--allow-empty", "-m", "next");
    expect(treeFingerprint(repo)).not.toBe(before);
  });

  it("changes on an unstaged edit", async () => {
    const before = treeFingerprint(repo);
    await writeFile(join(repo, "a.txt"), "two\n");
    expect(treeFingerprint(repo)).not.toBe(before);
  });

  it("changes when an edit is staged and then edited again", async () => {
    await writeFile(join(repo, "a.txt"), "two\n");
    git("add", "a.txt");
    const staged = treeFingerprint(repo);
    await writeFile(join(repo, "a.txt"), "three\n");
    expect(treeFingerprint(repo)).not.toBe(staged);
  });

  it("changes on a new untracked file and on its content", async () => {
    const before = treeFingerprint(repo);
    await writeFile(join(repo, "new.txt"), "x\n");
    const added = treeFingerprint(repo);
    await writeFile(join(repo, "new.txt"), "y\n");
    expect(added).not.toBe(before);
    expect(treeFingerprint(repo)).not.toBe(added);
  });

  it("ignores a gitignored file", async () => {
    const before = treeFingerprint(repo);
    await writeFile(join(repo, "x.log"), "noise\n");
    expect(treeFingerprint(repo)).toBe(before);
  });

  it("changes on an untracked nested repository", async () => {
    const before = treeFingerprint(repo);
    await mkdir(join(repo, "sub"));
    execFileSync("git", ["init", "-q"], { cwd: join(repo, "sub") });
    expect(treeFingerprint(repo)).not.toBe(before);
  });

  it("changes on an untracked symlink, dangling or retargeted", async () => {
    const before = treeFingerprint(repo);
    await symlink("missing-one", join(repo, "link"));
    const first = treeFingerprint(repo);
    await rm(join(repo, "link"));
    await symlink("missing-two", join(repo, "link"));
    expect(first).not.toBe(before);
    expect(treeFingerprint(repo)).not.toBe(first);
  });
});
