// A release whose only change is the categories file, on a real repository
// and bare remote: the release diff reads the file at the tag and the tip.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ReleasePlan } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { nodeApp } from "../helpers/node-app";
import { stubReview } from "../helpers/stub-review";

const run = promisify(execFile);

const ORIGIN_URL = "https://github.com/fimoklei/agent-harness.git";
const FILE = ".maestro/categories.yml";

describe("a categories-only release", { timeout: 30_000 }, () => {
  let base: string;
  let remote: string;
  let root: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  // v0.1.0 holds one skill and, where given, a categories file.
  const released = async (categories: string | null) => {
    await run("git", ["init", "--bare", "-b", "main", remote]);
    await run("git", ["clone", remote, root]);
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    await git(root, "config", `url.${remote}.insteadOf`, ORIGIN_URL);
    await git(root, "remote", "set-url", "origin", ORIGIN_URL);
    await mkdir(join(root, ".apm", "skills", "tdd"), { recursive: true });
    await writeFile(
      join(root, ".apm", "skills", "tdd", "SKILL.md"),
      "---\ndescription: Test-driven development loop\n---\n",
      "utf8",
    );
    await writeFile(join(root, "apm.yml"), "name: agent-harness\n", "utf8");
    if (categories !== null) {
      await mkdir(join(root, ".maestro"), { recursive: true });
      await writeFile(join(root, FILE), categories, "utf8");
    }
    await git(root, "add", ".");
    await git(root, "commit", "-m", "first release");
    await git(root, "tag", "v0.1.0");
    await git(root, "push", "--tags", "origin", "HEAD:main");
    await git(root, "config", "user.name", "Mate");
  };

  // One commit on main by Mate that touches the categories file alone.
  const mateCommits = async (message: string) => {
    await git(root, "commit", "-m", message);
    await git(root, "push", "origin", "HEAD:main");
  };

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-categories-release-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
  }, 30_000);

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  const planOf = async () => {
    const app = nodeApp(
      { HOME: base, MAESTRO_HOME: base, MAESTRO_INVENTORY_PATH: root },
      { gh: stubReview() },
    );
    await app.request("/api/harness/refresh", { method: "POST" });
    const plan = (await (
      await app.request("/api/harness/release-plan")
    ).json()) as ReleasePlan;
    return { app, plan };
  };

  it("lists an added categories file as one change, proposes a patch, and publishes it", async () => {
    await released(null);
    await mkdir(join(root, ".maestro"), { recursive: true });
    await writeFile(
      join(root, FILE),
      "version: 1\ncategories: [Planning]\nassignments: []\n",
      "utf8",
    );
    await git(root, "add", FILE);
    await mateCommits("Set Harness categories");

    const { app, plan } = await planOf();
    const published = await app.request("/api/harness/release", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        step: plan.proposedStep,
        previousTag: plan.previousTag,
        previousTagCommit: plan.previousTagCommit,
        revision: plan.revision,
      }),
    });

    expect(plan.delta).toEqual([
      {
        type: "categories",
        name: "categories",
        kind: "added",
        change: "addition",
        author: "Mate",
      },
    ]);
    expect(plan.proposedStep).toBe("patch");
    expect(await published.json()).toMatchObject({ tag: "v0.1.1" });
  });

  it("reads a file removed by hand as a deletion by its remover", async () => {
    await released("version: 1\ncategories: [Planning]\nassignments: []\n");
    await git(root, "rm", "-q", FILE);
    await mateCommits("Remove Harness categories");

    const { plan } = await planOf();

    expect(plan.delta).toEqual([
      {
        type: "categories",
        name: "categories",
        kind: "removed",
        change: "deletion",
        author: "Mate",
      },
    ]);
  });
});
