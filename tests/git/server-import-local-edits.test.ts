// A deployed copy edited in place travels back into the Working Harness as a pending change (#1254).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { HarnessGitAdapter } from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initGitClone, removeGitTempTree } from "../helpers/git-fixture";
import { nodeApp } from "../helpers/node-app";

const run = promisify(execFile);

const RELEASED = "---\nname: tdd\ndescription: Test first.\n---\n\nRed.\n";
const EDITED = "---\nname: tdd\ndescription: Test first.\n---\n\nRed, green.\n";

const sha = (text: string) =>
  `sha256:${createHash("sha256").update(text).digest("hex")}`;

describe("import local edits HTTP routes", { timeout: 30_000 }, () => {
  let base: string;
  let harnessRoot: string;
  let repo: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-import-local-edits-"));
    harnessRoot = join(base, "harness");
    repo = join(base, "app");
    await mkdir(join(harnessRoot, ".apm", "skills", "tdd"), {
      recursive: true,
    });
    await writeFile(
      join(harnessRoot, ".apm", "skills", "tdd", "SKILL.md"),
      RELEASED,
      "utf8",
    );
    await initGitClone(harnessRoot);
    await run("git", ["add", "-A"], { cwd: harnessRoot });
    await run(
      "git",
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "-m",
        "tdd",
      ],
      { cwd: harnessRoot },
    );
    // The release `tdd` was deployed from, still the Harness's latest state.
    await run("git", ["update-ref", "refs/maestro/tags/v1.0.0", "HEAD"], {
      cwd: harnessRoot,
    });

    // What a deploy of `tdd` from this Harness leaves behind.
    const deployed = join(repo, ".claude", "skills", "tdd");
    await mkdir(deployed, { recursive: true });
    await run("git", ["init"], { cwd: repo });
    await writeFile(join(deployed, "SKILL.md"), RELEASED, "utf8");
    await writeFile(
      join(repo, "apm.lock.yaml"),
      [
        "dependencies:",
        "- virtual_path: .apm/skills/tdd",
        "  resolved_ref: v1.0.0",
        "  package_type: claude_skill",
        "  host: github.com",
        "  repo_url: fimoklei/agent-harness",
        "  deployed_files:",
        "  - .claude/skills/tdd",
        "  - .claude/skills/tdd/SKILL.md",
        "  deployed_file_hashes:",
        `    .claude/skills/tdd/SKILL.md: '${sha(RELEASED)}'`,
        "",
      ].join("\n"),
      "utf8",
    );
  });

  afterEach(async () => {
    await removeGitTempTree(base);
  });

  async function makeApp() {
    const app = nodeApp({
      HOME: base,
      MAESTRO_HOME: base,
      MAESTRO_INVENTORY_PATH: harnessRoot,
    });
    const registered = await post(app, "/api/registry/repos", { path: repo });
    expect(registered.status).toBe(201);
    return app;
  }

  const post = (app: ReturnType<typeof nodeApp>, path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("carries the edited deployed copy into the Working Harness as pending", async () => {
    await writeFile(join(repo, ".claude", "skills", "tdd", "SKILL.md"), EDITED);
    const app = await makeApp();
    const target = { kind: "repo", repoPath: repo };

    const checked = await post(app, "/api/deploy/import-local-edits/check", {
      target,
    });
    expect(checked.status).toBe(200);
    expect(await checked.json()).toEqual({
      skills: [{ name: "tdd", refusal: null }],
    });

    const imported = await post(app, "/api/deploy/import-local-edits", {
      target,
      names: ["tdd"],
      undo: [],
    });
    expect(imported.status).toBe(200);
    expect(await imported.json()).toEqual({
      outcomes: [{ name: "tdd", refusal: null }],
    });

    expect(
      await readFile(
        join(harnessRoot, ".apm", "skills", "tdd", "SKILL.md"),
        "utf8",
      ),
    ).toBe(EDITED);
    const trees = await new HarnessGitAdapter().readMovementTrees(harnessRoot);
    expect(trees?.working.tdd).not.toBe(trees?.local.tdd);
  });

  it("refuses a repository outside the registry before reading it", async () => {
    const app = await makeApp();

    const response = await post(app, "/api/deploy/import-local-edits/check", {
      target: { kind: "repo", repoPath: join(base, "elsewhere") },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "repo-not-registered" });
  });
});
