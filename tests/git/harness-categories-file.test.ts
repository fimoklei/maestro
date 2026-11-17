// The Harness categories read at a release tag over the real disk and git. The
// remote is a bare repo on disk, so the whole suite is offline.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  type HarnessCategories,
  HarnessGitAdapter,
  ReleasedContentReader,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { nodeApp } from "../helpers/node-app";
import { stubReview } from "../helpers/stub-review";

const run = promisify(execFile);

const ORIGIN_URL = "https://github.com/fimoklei/agent-harness.git";
const FILE = ".maestro/categories.yml";

describe("the Harness categories at a release tag", { timeout: 30_000 }, () => {
  let base: string;
  let remote: string;
  let root: string;

  const git = (...args: string[]) => run("git", args, { cwd: root });

  const commit = async (text: string | null, message: string) => {
    if (text !== null) {
      await mkdir(join(root, ".maestro"), { recursive: true });
      await writeFile(join(root, FILE), text, "utf8");
    }
    await git("add", ".");
    await git("commit", "--allow-empty", "-m", message);
  };

  const release = async (tag: string) => {
    await git("tag", tag);
    await git("push", "origin", "HEAD:main", tag);
  };

  const read = async () => {
    await new HarnessGitAdapter({
      released: new ReleasedContentReader(),
    }).fetch(root);
    const app = nodeApp(
      { HOME: base, MAESTRO_HOME: base, MAESTRO_INVENTORY_PATH: root },
      { gh: stubReview() },
    );
    return (await app.request("/api/categories/harness")).json();
  };

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-harness-categories-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
    await run("git", ["init", "--bare", "-b", "main", remote]);
    await run("git", ["clone", remote, root]);
    await git("config", "user.email", "test@example.com");
    await git("config", "user.name", "Test");
    // git resolves the GitHub origin to the bare repo next door.
    await git("config", `url.${remote}.insteadOf`, ORIGIN_URL);
    await git("remote", "set-url", "origin", ORIGIN_URL);
    await writeFile(join(root, "apm.yml"), "name: agent-harness\n", "utf8");
    await commit(null, "harness");
  }, 30_000);

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  it("counts the categories in the file at the latest release tag", async () => {
    await commit(
      "version: 1\ncategories: [Planning, Writing]\nassignments: []\n",
      "categories",
    );
    await release("v1.0.0");
    // Merged after the release: not read until the next one.
    await commit(
      "version: 1\ncategories: [Planning, Writing, Review]\nassignments: []\n",
      "more categories",
    );
    await git("push", "origin", "HEAD:main");

    expect(await read()).toEqual({
      kind: "listed",
      tag: "v1.0.0",
      count: 2,
      changed: true,
    } satisfies HarnessCategories);
  });

  it("reads a release without the file as no Harness categories", async () => {
    await release("v1.0.0");

    expect(await read()).toEqual({ kind: "none" } satisfies HarnessCategories);
  });

  it("refuses a file over 256 KB at the tag", async () => {
    await commit(
      `version: 1\ncategories: []\nassignments: []\n# ${"x".repeat(256 * 1024)}\n`,
      "large categories",
    );
    await release("v1.0.0");

    expect(await read()).toEqual({
      kind: "faulty",
      tag: "v1.0.0",
    } satisfies HarnessCategories);
  });

  it("reads a folder in the file's place as no file", async () => {
    await mkdir(join(root, FILE), { recursive: true });
    await writeFile(join(root, FILE, "inside"), "x\n", "utf8");
    await commit(null, "a folder named like the file");
    await release("v1.0.0");

    expect(await read()).toEqual({ kind: "none" } satisfies HarnessCategories);
  });
});
