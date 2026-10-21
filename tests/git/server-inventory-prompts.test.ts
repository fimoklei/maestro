// A prompt merged, released, then read at the tag, while a target that holds
// the previous release stays Up to date. The remote is a bare repo on disk, so
// the journey is offline.
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  type ApmDriverPort,
  HarnessGitAdapter,
  type HarnessState,
  type InventoryPrimitive,
  ReleasedContentReader,
  type ReleasePlan,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { unreachable } from "../helpers/in-memory-app";
import { nodeApp } from "../helpers/node-app";
import { stubReview } from "../helpers/stub-review";

const run = promisify(execFile);

const ORIGIN_URL = "https://github.com/fimoklei/agent-harness.git";

const PROMPT_BODY =
  "Review [PR LINK] for $ARGUMENTS.\n\nStart with $1, then the rest.\n";

// A target that installed tdd from v0.1.0, the release before the prompt.
const TARGET_LOCKFILE =
  "lockfile_version: '1'\ndependencies:\n- repo_url: fimoklei/agent-harness\n  host: github.com\n  resolved_ref: v0.1.0\n  virtual_path: .apm/skills/tdd\n  package_type: claude_skill\n";

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

  // apm sees only that a newer tag exists; Maestro reads the content.
  const makeApp = () =>
    nodeApp(
      { HOME: base, MAESTRO_HOME: base, MAESTRO_INVENTORY_PATH: root },
      {
        gh: stubReview(),
        apm: unreachable<ApmDriverPort>("apm", {
          checkOutdated: async () => ({
            ok: true,
            behind: [{ name: "tdd", current: "v0.1.0", latest: "v0.1.1" }],
          }),
        }),
      },
    );

  const primitivesOf = async (app: ReturnType<typeof makeApp>) => {
    const res = await app.request("/api/inventory/primitives");
    expect(res.status).toBe(200);
    return ((await res.json()) as { primitives: InventoryPrimitive[] })
      .primitives;
  };

  it("waits in Pending release, releases as a patch, reads at the tag and leaves a target Up to date", async () => {
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
    const refreshed = (await (
      await app.request("/api/harness/refresh", { method: "POST" })
    ).json()) as HarnessState;

    // Merged but never released: waiting in Pending release, off the list.
    expect(
      refreshed.stages.release.outcome === "read"
        ? refreshed.stages.release.rows.map((row) => ({
            type: row.type,
            name: row.name,
            change: row.change,
          }))
        : null,
    ).toEqual([{ type: "prompt", name: "pr-review", change: "addition" }]);
    expect((await primitivesOf(app)).map(({ type }) => type)).toEqual([
      "skill",
    ]);

    const plan = (await (
      await app.request("/api/harness/release-plan")
    ).json()) as ReleasePlan;
    expect(plan.proposedStep).toBe("patch");
    expect(plan.reason).toBe("No skill was added, deleted or renamed.");
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
        pendingRelease: null,
      },
      {
        type: "prompt",
        name: "pr-review",
        description: "Review a pull request",
        path: ".maestro/prompts/pr-review.md",
        pendingRelease: null,
        text: PROMPT_BODY,
        nameValid: true,
      },
    ]);

    const target = join(base, "target");
    await mkdir(target);
    await run("git", ["init", "-b", "main", target]);
    await writeFile(join(target, "apm.lock.yaml"), TARGET_LOCKFILE, "utf8");
    const registered = await app.request("/api/registry/repos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: target }),
    });
    expect(registered.status).toBe(201);
    const drift = await app.request(
      `/api/drift?repo=${encodeURIComponent(target)}`,
    );

    // older-tag is the Up to date reading: tdd's content never moved.
    expect(await drift.json()).toEqual({
      behind: [
        {
          name: "tdd",
          current: "v0.1.0",
          latest: "v0.1.1",
          reading: "older-tag",
        },
      ],
    });
  });

  it("keeps a released prompt under its old name while its merged rename waits", async () => {
    await mkdir(join(root, ".maestro", "prompts"), { recursive: true });
    await writeFile(
      join(root, ".maestro", "prompts", "pr-review.md"),
      PROMPT_BODY,
      "utf8",
    );
    await commitAndPush("add prompt");
    await git(root, "tag", "v0.2.0");
    await git(root, "push", "--tags", "origin");
    await git(
      root,
      "mv",
      join(".maestro", "prompts", "pr-review.md"),
      join(".maestro", "prompts", "pr-check.md"),
    );
    await commitAndPush("rename prompt");
    const app = makeApp();
    await app.request("/api/harness/refresh", { method: "POST" });

    const prompts = (await primitivesOf(app)).filter(
      (primitive) => primitive.type === "prompt",
    );

    expect(
      prompts.map(({ name, text, pendingRelease }) => ({
        name,
        text,
        pendingRelease,
      })),
    ).toEqual([
      {
        name: "pr-review",
        text: PROMPT_BODY,
        pendingRelease: {
          change: "rename",
          renamedTo: "pr-check",
          defaultBranch: "main",
        },
      },
    ]);
  });
});
