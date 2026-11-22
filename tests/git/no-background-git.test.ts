import { execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";

const BACKGROUND_JOB = /run_command: .*\bgit (maintenance|gc)\b/;

describe("git in a test", () => {
  let root: string;
  let trace: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "maestro-no-background-git-"));
    trace = join(root, "trace.log");
  });

  afterEach(async () => {
    await removeGitTempTree(root);
  });

  it("starts no maintenance or gc when it pushes into a bare remote", async () => {
    const work = join(root, "work");
    const bare = join(root, "remote.git");
    const git = (...args: string[]) =>
      execFileSync("git", args, {
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Fixture",
          GIT_AUTHOR_EMAIL: "fixture@example.invalid",
          GIT_COMMITTER_NAME: "Fixture",
          GIT_COMMITTER_EMAIL: "fixture@example.invalid",
        },
      });
    git("init", "-q", "--bare", "-b", "main", bare);
    git("init", "-q", "-b", "main", work);
    git("-C", work, "commit", "-q", "--allow-empty", "-m", "one");
    vi.stubEnv("GIT_TRACE", trace);

    git("-C", work, "push", "-q", bare, "main");

    expect(await readFile(trace, "utf8")).toMatch(/receive-pack/);
    expect(await readFile(trace, "utf8")).not.toMatch(BACKGROUND_JOB);
  });
});
