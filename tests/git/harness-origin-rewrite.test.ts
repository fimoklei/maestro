// An `insteadOf` rewrite moves where git connects, never which Harness a
// deploy names: apm's refs are built from the configured origin.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { app } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initGitClone, removeGitTempTree } from "../helpers/git-fixture";

const run = promisify(execFile);

const LOCAL = {
  "content-type": "application/json",
  host: "127.0.0.1:3000",
  origin: "http://127.0.0.1:3000",
};

describe("a Harness clone whose origin git rewrites", () => {
  let root: string;
  let clone: string;
  let repo: string;
  const previous = {
    HOME: process.env.HOME,
    MAESTRO_HOME: process.env.MAESTRO_HOME,
  };

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), "maestro-rewrite-")));
    clone = join(root, "harness");
    repo = join(root, "consumer");
    const maestroHome = join(root, "maestro-home");

    await mkdir(join(clone, ".apm", "skills", "tdd"), { recursive: true });
    await writeFile(
      join(clone, ".apm", "skills", "tdd", "SKILL.md"),
      "---\nname: tdd\ndescription: Test-driven development loop\n---\n",
    );
    await initGitClone(clone, { release: "v0.6.0" });
    await run("git", [
      "-C",
      clone,
      "config",
      `url.${join(root, "mirror")}.insteadOf`,
      "git@github.com:fimoklei/agent-harness",
    ]);

    await mkdir(repo);

    await mkdir(maestroHome);
    await writeFile(
      join(maestroHome, "config.json"),
      JSON.stringify({
        repos: [{ path: repo }],
        inventoryPath: clone,
        // An unfinished operation stops the deploy before apm runs.
        targetOperations: [
          {
            key: repo,
            target: { kind: "repo", repoPath: repo },
            harness: "fimoklei/agent-harness",
            kind: "deploy",
            release: "v0.6.0",
            previous: [],
            desired: ["tdd"],
            tools: null,
            startedAt: "2026-09-27T00:00:00.000Z",
          },
        ],
      }),
    );
    process.env.HOME = join(root, "home");
    process.env.MAESTRO_HOME = maestroHome;
  });

  afterEach(async () => {
    process.env.HOME = previous.HOME;
    process.env.MAESTRO_HOME = previous.MAESTRO_HOME;
    await removeGitTempTree(root);
  });

  it("names the Harness by its configured origin, so a deploy passes the origin check", async () => {
    const res = await app.request("/api/deploy", {
      method: "POST",
      headers: LOCAL,
      body: JSON.stringify({
        type: "skill",
        name: "tdd",
        target: { kind: "repo", repoPath: repo },
      }),
    });

    expect(await res.json()).toEqual({ error: "operation-unfinished" });
  });
});
