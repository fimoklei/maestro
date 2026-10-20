// A prompt merged, released, then read at the tag. The remote is a bare repo
// on disk, so the journey is offline.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  HarnessGitAdapter,
  type InventoryPrimitive,
  ReleasedContentReader,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { nodeApp } from "../helpers/node-app";
import { stubReview } from "../helpers/stub-review";

const run = promisify(execFile);

const ORIGIN_URL = "https://github.com/fimoklei/agent-harness.git";

const PROMPT_BODY =
  "Review [PR LINK] for $ARGUMENTS.\n\nStart with $1, then the rest.\n";

describe("released prompts on the Inventory", { timeout: 30_000 }, () => {
  let base: string;
  let remote: string;
  let root: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  const commitAndPush = async (message: string) => {
    await git(root, "add", "-A", ".");
    await git(root, "commit", "-m", message);
    await git(root, "push", "origin", "HEAD:main");
  };

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-inventory-prompts-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
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
    await git(root, "add", ".");
    await git(root, "commit", "-m", "first skill");
    await git(root, "tag", "v0.1.0");
    await git(root, "push", "--tags", "origin", "HEAD:main");
    await new HarnessGitAdapter({
      released: new ReleasedContentReader(),
    }).fetch(root);
  }, 30_000);

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  const makeApp = () =>
    nodeApp(
      { HOME: base, MAESTRO_HOME: base, MAESTRO_INVENTORY_PATH: root },
      { gh: stubReview() },
    );

  const primitivesOf = async (app: ReturnType<typeof makeApp>) => {
    const res = await app.request("/api/inventory/primitives");
    expect(res.status).toBe(200);
    return ((await res.json()) as { primitives: InventoryPrimitive[] })
      .primitives;
  };

  it("lists a merged prompt only once a release carries it, with its text after the frontmatter", async () => {
    await mkdir(join(root, ".maestro", "prompts"), { recursive: true });
    await writeFile(
      join(root, ".maestro", "prompts", "pr-review.md"),
      `---\ndescription: Review a pull request\n---\n${PROMPT_BODY}`,
      "utf8",
    );
    await writeFile(
      join(root, ".maestro", "prompts", "notes.txt"),
      "not a prompt\n",
      "utf8",
    );
    await commitAndPush("add prompt");
    const app = makeApp();
    await app.request("/api/harness/refresh", { method: "POST" });

    // Merged but never released: still off the list.
    expect((await primitivesOf(app)).map(({ type }) => type)).toEqual([
      "skill",
    ]);

    const plan = (await (
      await app.request("/api/harness/release-plan")
    ).json()) as {
      previousTag: string | null;
      previousTagCommit: string | null;
      revision: string;
    };
    const released = await app.request("/api/harness/release", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        step: "patch",
        previousTag: plan.previousTag,
        previousTagCommit: plan.previousTagCommit,
        revision: plan.revision,
      }),
    });
    expect(released.status).toBe(200);

    expect(await primitivesOf(app)).toEqual([
      {
        type: "skill",
        name: "tdd",
        description: "Test-driven development loop",
        path: ".apm/skills/tdd",
      },
      {
        type: "prompt",
        name: "pr-review",
        description: "Review a pull request",
        path: ".maestro/prompts/pr-review.md",
        text: PROMPT_BODY,
        nameValid: true,
      },
    ]);
  });
});
