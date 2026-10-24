// Delete, restore and discard a prompt over the real disk and git. The remote
// is a bare repo on disk, so the whole suite is offline.
import { execFile } from "node:child_process";
import {
  lstat,
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
import {
  HarnessGitAdapter,
  type HarnessState,
  ReleasedContentReader,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeGitTempTree } from "../helpers/git-fixture";
import { nodeApp } from "../helpers/node-app";
import { stubReview } from "../helpers/stub-review";

const run = promisify(execFile);

const ORIGIN_URL = "https://github.com/fimoklei/agent-harness.git";
const FILE = ".maestro/prompts/pr-review.md";

describe("prompt files on disk", { timeout: 30_000 }, () => {
  let base: string;
  let remote: string;
  let root: string;
  let localHead: string;

  const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });

  const writePrompt = async (text: string) => {
    await mkdir(join(root, ".maestro", "prompts"), { recursive: true });
    await writeFile(join(root, FILE), text, "utf8");
  };

  const commit = async (text: string, message: string) => {
    await writePrompt(text);
    await git(root, "add", ".");
    await git(root, "commit", "-m", message);
    return (await git(root, "rev-parse", "HEAD")).stdout.trim();
  };

  const onDisk = () => readFile(join(root, FILE), "utf8");

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-prompt-files-"));
    remote = join(base, "remote.git");
    root = join(base, "clone");
    await run("git", ["init", "--bare", "-b", "main", remote]);
    await run("git", ["clone", remote, root]);
    await git(root, "config", "user.email", "test@example.com");
    await git(root, "config", "user.name", "Test");
    // git resolves the GitHub origin to the bare repo next door.
    await git(root, "config", `url.${remote}.insteadOf`, ORIGIN_URL);
    await git(root, "remote", "set-url", "origin", ORIGIN_URL);
    await writeFile(join(root, "apm.yml"), "name: agent-harness\n", "utf8");
    await commit("Review $ARGUMENTS\n", "first prompt");
    await git(root, "push", "origin", "HEAD:main");
    localHead = await commit("Review $ARGUMENTS locally\n", "local work");
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

  const post = (
    app: ReturnType<typeof makeApp>,
    path: string,
    body: Record<string, unknown>,
  ) =>
    app.request(`/api/harness/primitive/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "prompt", name: "pr-review", ...body }),
    });

  const workingTree = async (app: ReturnType<typeof makeApp>) => {
    const checks = (await (
      await app.request("/api/harness/primitive/delete/check")
    ).json()) as {
      prompt: Record<string, { inClone: boolean; workingTree?: string }>;
    };
    return checks.prompt["pr-review"]?.workingTree ?? "";
  };

  const remoteTree = async (app: ReturnType<typeof makeApp>) => {
    const state = (await (
      await app.request("/api/harness/refresh", { method: "POST" })
    ).json()) as HarnessState;
    const rows =
      state.stages.proposal.outcome === "read"
        ? state.stages.proposal.rows
        : [];
    return rows.find((row) => row.name === "pr-review")?.remoteTree ?? "";
  };

  // A link to a file outside the Harness, in place of the prompt file.
  const linkOut = async () => {
    const outside = join(base, "outside.md");
    await writeFile(outside, "not the Harness\n", "utf8");
    await rm(join(root, FILE));
    await symlink(outside, join(root, FILE));
    return outside;
  };

  it("deletes only the prompt file from the clone", async () => {
    const app = makeApp();

    const response = await post(app, "delete", {
      seenWorkingTree: await workingTree(app),
    });

    expect(response.status).toBe(200);
    await expect(lstat(join(root, FILE))).rejects.toThrow();
    expect(await readFile(join(root, "apm.yml"), "utf8")).toBe(
      "name: agent-harness\n",
    );
  });

  it("restores the last local commit's copy of a deleted prompt", async () => {
    const app = makeApp();
    await rm(join(root, FILE));

    const response = await post(app, "restore", { seenHeadCommit: localHead });

    expect(response.status).toBe(200);
    expect(await onDisk()).toBe("Review $ARGUMENTS locally\n");
  });

  it("discards an unproposed edit to the default-branch copy", async () => {
    await git(root, "reset", "--hard", "origin/main");
    await writePrompt("Review $ARGUMENTS twice\n");
    const app = makeApp();

    const response = await post(app, "discard", {
      seenRemoteTree: await remoteTree(app),
    });

    expect(response.status).toBe(200);
    expect(await onDisk()).toBe("Review $ARGUMENTS\n");
  });

  it("deletes nothing through a prompt file that links out of the Harness", async () => {
    const app = makeApp();
    const outside = await linkOut();

    const response = await post(app, "delete", {
      seenWorkingTree: await workingTree(app),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "destination-unsafe" });
    expect((await lstat(join(root, FILE))).isSymbolicLink()).toBe(true);
    expect(await readFile(outside, "utf8")).toBe("not the Harness\n");
  });

  it("discards nothing through a prompt file that links out of the Harness", async () => {
    const app = makeApp();
    const outside = await linkOut();

    const response = await post(app, "discard", {
      seenRemoteTree: await remoteTree(app),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "destination-unsafe" });
    expect((await lstat(join(root, FILE))).isSymbolicLink()).toBe(true);
    expect(await readFile(outside, "utf8")).toBe("not the Harness\n");
  });

  it("restores nothing over a prompt file that links out of the Harness", async () => {
    const app = makeApp();
    const outside = await linkOut();

    const response = await post(app, "restore", { seenHeadCommit: localHead });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "destination-unsafe" });
    expect((await lstat(join(root, FILE))).isSymbolicLink()).toBe(true);
    expect(await readFile(outside, "utf8")).toBe("not the Harness\n");
  });

  it("proposes nothing for a prompt file that links out of the Harness", async () => {
    const app = makeApp();
    await linkOut();

    const response = await app.request("/api/harness/promote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "prompt", name: "pr-review" }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "destination-unsafe" });
    const { stdout } = await git(
      root,
      "ls-remote",
      "origin",
      "refs/heads/maestro/*",
    );
    expect(stdout).toBe("");
  });

  it("refuses to restore into a prompts folder that links out of the Harness", async () => {
    const app = makeApp();
    const outside = join(base, "outside-prompts");
    await mkdir(outside);
    await rm(join(root, ".maestro", "prompts"), { recursive: true });
    await symlink(outside, join(root, ".maestro", "prompts"));

    const response = await post(app, "restore", { seenHeadCommit: localHead });

    expect(await response.json()).toEqual({ error: "destination-unsafe" });
    await expect(lstat(join(outside, "pr-review.md"))).rejects.toThrow();
  });
});
