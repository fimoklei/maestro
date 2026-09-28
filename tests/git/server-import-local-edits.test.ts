// A deployed copy edited in place travels back into the Working Harness as a pending change (#1254).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  CopySkillFolder,
  DeployedContentAdapter,
  DeployedLocation,
  GlobalDeployStateReader,
  HarnessGitAdapter,
  ImportLocalEdits,
  ImportSkill,
  InFlightLocks,
  InventoryReader,
  NodeCopyTreeFs,
  NodeFileSystem,
  releasedSkillsFromGit,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initGitClone, removeGitTempTree } from "../helpers/git-fixture";
import { realRegistry } from "../helpers/real-registry";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy, stubRetryOperation } from "../helpers/stub-deploy";
import { stubDrift } from "../helpers/stub-drift";
import { stubFolderChooser } from "../helpers/stub-folder-chooser";
import { stubHarness } from "../helpers/stub-harness";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

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
    const fs = new NodeFileSystem();
    const copyTreeFs = new NodeCopyTreeFs();
    const registry = realRegistry(fs, join(base, "config.json"));
    expect(await registry.register(repo)).toMatchObject({ ok: true });
    const location = new DeployedLocation({ HOME: base });
    const content = new DeployedContentAdapter({ location });
    const git = new HarnessGitAdapter();
    const resolveRoot = async () => fs.realpath(harnessRoot);
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => harnessRoot,
      readReleasedSkills: releasedSkillsFromGit(git),
    });
    const deployState = new GlobalDeployStateReader({
      fs,
      content,
      toolPresence: {
        detectGlobalTools: async () => {
          throw new Error("the global target is not under test here");
        },
      },
    });
    const importSkill = new ImportSkill({
      resolveRoot,
      fs,
      homeRoot: () => base,
      copy: new CopySkillFolder({ fs: copyTreeFs }),
      facts: copyTreeFs,
      git,
      deployedTargets: async () => [
        {
          treeRoot: await fs.realpath(repo),
          lockfilePath: join(await fs.realpath(repo), "apm.lock.yaml"),
        },
      ],
    });
    const locks = new InFlightLocks();
    return createApp({
      registry,
      inventory,
      importSkill,
      importLocalEdits: new ImportLocalEdits({
        registry,
        deployState,
        content,
        tree: {
          listRawEntries: (path) => fs.listRawEntries(path),
          readFile: (path) => fs.readFile(path),
          describe: (path) => copyTreeFs.describe(path),
        },
        globalRoot: () => "/nonexistent-apm-root",
        home: () => base,
        importSkill,
        git,
        resolveRoot,
        locks: new InFlightLocks(),
      }),
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      deployState,
      deploy: stubDeploy({ inventory, registry, locks }),
      remove: stubRemove({ registry, locks }),
      retryOperation: stubRetryOperation({ registry, locks }),
      drift: stubDrift({ registry }),
      resolveGlobalRoot: () => "/nonexistent-apm-root",
      folderChooser: stubFolderChooser(),
      update: stubUpdate(),
      enforceOriginHost: false,
    });
  }

  const post = (
    app: Awaited<ReturnType<typeof makeApp>>,
    path: string,
    body: unknown,
  ) =>
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
