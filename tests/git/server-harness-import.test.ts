import { execFile } from "node:child_process";
import {
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  CopySkillFolder,
  HarnessGitAdapter,
  ImportSkill,
  InFlightLocks,
  InventoryReader,
  NodeCopyTreeFs,
  NodeFileSystem,
  releasedSkillsFromGit,
} from "@maestro/core";
import { createApp } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initGitClone } from "../helpers/git-fixture";
import { realRegistry } from "../helpers/real-registry";
import { stubConnect } from "../helpers/stub-connect";
import { stubDeploy, stubRetryOperation } from "../helpers/stub-deploy";
import { stubDeployState } from "../helpers/stub-deploy-state";
import { stubDrift } from "../helpers/stub-drift";
import { stubFolderChooser } from "../helpers/stub-folder-chooser";
import { stubHarness } from "../helpers/stub-harness";
import { stubPromotes } from "../helpers/stub-promote";
import { stubPublish } from "../helpers/stub-publish";
import { stubRemove } from "../helpers/stub-remove";
import { stubScaffold } from "../helpers/stub-scaffold";
import { stubUpdate } from "../helpers/stub-update";

// Integration lane: the whole import journey through the HTTP route against a
// real disk — what lands in the Working harness, what is skipped, and what is
// refused before anything is written (#576).
describe("harness import HTTP route", () => {
  let base: string;
  let harnessRoot: string;
  let source: string;

  const manifest = (description = "Reviews code.") =>
    `---\nname: whatever-the-author-called-it\ndescription: ${description}\n---\n\nBody.\n`;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-import-"));
    harnessRoot = join(base, "harness");
    source = join(base, "Code Review");
    await mkdir(join(harnessRoot, ".apm", "skills"), { recursive: true });
    await mkdir(join(source, "references"), { recursive: true });
    await mkdir(join(source, ".git", "objects"), { recursive: true });
    await writeFile(join(source, "SKILL.md"), manifest(), "utf8");
    await writeFile(join(source, "references", "notes.md"), "notes\n", "utf8");
    await writeFile(join(source, "run.sh"), "#!/bin/sh\n", { mode: 0o755 });
    await writeFile(join(source, ".git", "objects", "blob"), "x", "utf8");
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  function makeApp(
    deployedTargets: { treeRoot: string; lockfilePath: string }[] = [],
  ) {
    const fs = new NodeFileSystem();
    const copyTreeFs = new NodeCopyTreeFs();
    const registry = realRegistry(fs, join(base, "config.json"));
    const inventory = new InventoryReader({
      fs,
      resolvePath: () => harnessRoot,
      // The real released read: these suites build real repositories,
      // so Inventory answers from `refs/maestro/tags` as it does live (#841).
      readReleasedSkills: releasedSkillsFromGit(new HarnessGitAdapter()),
    });
    const locks = new InFlightLocks();
    return createApp({
      registry,
      inventory,
      importSkill: new ImportSkill({
        resolveRoot: async () => fs.realpath(harnessRoot),
        fs,
        homeRoot: () => base,
        copy: new CopySkillFolder({ fs: copyTreeFs }),
        facts: copyTreeFs,
        git: new HarnessGitAdapter(),
        deployedTargets: async () => deployedTargets,
      }),
      harness: stubHarness(),
      publish: stubPublish(),
      ...stubPromotes(),
      connect: stubConnect(),
      scaffold: stubScaffold(),
      deployState: stubDeployState({ fs }),
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

  const post = (app: ReturnType<typeof makeApp>, path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const check = (app: ReturnType<typeof makeApp>, body: unknown) =>
    post(app, "/api/harness/import/check", body);

  const importSkill = (app: ReturnType<typeof makeApp>, body: unknown) =>
    post(app, "/api/harness/import", body);

  it("copies nested content and the executable bit, and skips .git", async () => {
    const app = makeApp();

    const response = await importSkill(app, { source });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: "add",
      name: "code-review",
      skipped: 1,
    });
    const landed = join(harnessRoot, ".apm", "skills", "code-review");
    expect(await readFile(join(landed, "references", "notes.md"), "utf8")).toBe(
      "notes\n",
    );
    expect((await stat(join(landed, "run.sh"))).mode & 0o111).not.toBe(0);
    await expect(stat(join(landed, ".git"))).rejects.toThrow();
  });

  it("rewrites the copied manifest's name to the directory name", async () => {
    const app = makeApp();

    await importSkill(app, { source, name: "reviewer" });

    const landed = join(harnessRoot, ".apm", "skills", "reviewer", "SKILL.md");
    expect(await readFile(landed, "utf8")).toContain("name: reviewer");
  });

  it("proposes a slug and reports the conventions without refusing", async () => {
    await writeFile(
      join(source, "SKILL.md"),
      `${manifest("d".repeat(1025))}${"line\n".repeat(500)}`,
      "utf8",
    );
    const app = makeApp();

    const response = await check(app, { source });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: "add",
      name: "code-review",
      sourceBlocker: null,
      nameBlocker: null,
      advisories: ["long-manifest", "long-description"],
    });
  });

  it("reports a name the harness already holds on the name field", async () => {
    await mkdir(join(harnessRoot, ".apm", "skills", "code-review"), {
      recursive: true,
    });
    const app = makeApp();

    const response = await check(app, { source });

    expect(await response.json()).toMatchObject({
      sourceBlocker: null,
      nameBlocker: "name-taken",
    });
  });

  it("refuses a source with no SKILL.md, leaving the harness untouched", async () => {
    await rm(join(source, "SKILL.md"));
    const app = makeApp();

    const response = await importSkill(app, { source });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "missing-manifest" });
    await expect(
      stat(join(harnessRoot, ".apm", "skills", "code-review")),
    ).rejects.toThrow();
  });

  it("refuses a copy the registered target's lockfile records as deployed", async () => {
    const repo = join(base, "repo");
    const deployed = join(repo, ".claude", "skills", "code-review");
    await mkdir(deployed, { recursive: true });
    await writeFile(join(deployed, "SKILL.md"), manifest(), "utf8");
    const lockfilePath = join(repo, "apm.lock.yaml");
    await writeFile(
      lockfilePath,
      [
        "dependencies:",
        "- virtual_path: skills/code-review",
        "  resolved_ref: v1.0.0",
        "  package_type: claude_skill",
        "  deployed_files:",
        "  - .claude/skills/code-review",
        "  - .claude/skills/code-review/SKILL.md",
        "",
      ].join("\n"),
      "utf8",
    );
    const app = makeApp([{ treeRoot: repo, lockfilePath }]);

    const response = await importSkill(app, { source: deployed });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "deployed-copy" });
  });

  it("lets a hand-authored skill through the same folder a deploy would use (#667)", async () => {
    const repo = join(base, "repo");
    const authored = join(repo, ".claude", "skills", "code-review");
    await mkdir(authored, { recursive: true });
    await writeFile(join(authored, "SKILL.md"), manifest(), "utf8");
    const lockfilePath = join(repo, "apm.lock.yaml");
    await writeFile(lockfilePath, "dependencies: []\n", "utf8");
    const app = makeApp([{ treeRoot: repo, lockfilePath }]);

    const response = await importSkill(app, { source: authored });

    expect(response.status).toBe(200);
  });

  it("reports the .git entries the copy left behind", async () => {
    const app = makeApp();

    const response = await importSkill(app, { source });

    expect(await response.json()).toEqual({
      mode: "add",
      name: "code-review",
      skipped: 1,
    });
  });

  it("refuses a harness whose skills folder points outside the harness", async () => {
    const elsewhere = join(base, "elsewhere");
    await mkdir(elsewhere, { recursive: true });
    await rm(join(harnessRoot, ".apm"), { recursive: true });
    await mkdir(join(harnessRoot, ".apm"), { recursive: true });
    await symlink(elsewhere, join(harnessRoot, ".apm", "skills"));
    const app = makeApp();

    const response = await importSkill(app, { source });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "destination-unsafe",
    });
    expect(await readdir(elsewhere)).toEqual([]);
  });

  it("rebuilds a manifest whose name is not a plain scalar", async () => {
    // A frontmatter that parses and describes, but whose `name` is a mapping:
    // the textual rewrite cannot fix it, so the document one does.
    await writeFile(
      join(source, "SKILL.md"),
      "---\nname:\n  first: a\ndescription: Reviews code.\n---\n",
      "utf8",
    );
    const app = makeApp();

    const response = await importSkill(app, { source, name: "reviewer" });

    expect(response.status).toBe(200);
    const landed = join(harnessRoot, ".apm", "skills", "reviewer", "SKILL.md");
    expect(await readFile(landed, "utf8")).toContain("name: reviewer");
  });

  it("refuses a folder outside the home ceiling", async () => {
    const app = makeApp();

    const response = await importSkill(app, { source: "/etc" });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "outside-root" });
  });

  // The whole chain in one case: a skill deployed into a repository, edited
  // there, carried back through the route, and waiting in the Working harness
  // as a pending change (#732). The seams are the value, not the steps.
  it("carries an edited deployed copy back into the Harness as a pending change", async () => {
    const run = promisify(execFile);
    const git = (...args: string[]) =>
      run(
        "git",
        ["-c", "user.email=t@example.invalid", "-c", "user.name=T", ...args],
        {
          cwd: harnessRoot,
        },
      );
    // A real clone: a committed skill, a GitHub origin, and the remote head
    // ref the movement read needs. Offline — the origin URL is never fetched.
    await initGitClone(harnessRoot);
    const held = join(harnessRoot, ".apm", "skills", "code-review");
    await mkdir(held, { recursive: true });
    await writeFile(join(held, "SKILL.md"), manifest("As released."), "utf8");
    await writeFile(join(held, "old-note.md"), "dropped\n", "utf8");
    await git("add", "-A");
    await git("commit", "-m", "first skill");

    // What apm deployed, and what the author then fixed in place.
    const repo = join(base, "repo");
    const deployed = join(repo, ".claude", "skills", "code-review");
    await mkdir(deployed, { recursive: true });
    await writeFile(
      join(deployed, "SKILL.md"),
      manifest("Fixed in place."),
      "utf8",
    );
    const lockfilePath = join(repo, "apm.lock.yaml");
    await writeFile(
      lockfilePath,
      [
        "dependencies:",
        "- virtual_path: .apm/skills/code-review",
        "  resolved_ref: v1.0.0",
        "  package_type: claude_skill",
        "  host: github.com",
        "  repo_url: fimoklei/agent-harness",
        "  deployed_files:",
        "  - .claude/skills/code-review",
        "  - .claude/skills/code-review/SKILL.md",
        "",
      ].join("\n"),
      "utf8",
    );
    const app = makeApp([{ treeRoot: repo, lockfilePath }]);

    const offered = await check(app, { source: deployed });
    expect(await offered.json()).toMatchObject({
      mode: "update",
      name: "code-review",
      sourceBlocker: null,
      nameBlocker: null,
    });

    const response = await importSkill(app, { source: deployed });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      mode: "update",
      name: "code-review",
    });
    // The whole folder, not a merge: the harness's own file is gone with it.
    expect(await readFile(join(held, "SKILL.md"), "utf8")).toContain(
      "Fixed in place.",
    );
    expect(await readdir(held)).toEqual(["SKILL.md"]);
    // The same signal the Harness screen reads as a pending proposal.
    const trees = await new HarnessGitAdapter().readMovementTrees(harnessRoot);
    expect(trees?.working["code-review"]).not.toBe(trees?.local["code-review"]);
  }, 30_000);

  // The same chain for a copy one Root package deployed: the record names no
  // one skill, so the name comes from its deployed files (#967).
  it("carries an edited copy a Root package deployed back as a pending change", async () => {
    const run = promisify(execFile);
    const git = (...args: string[]) =>
      run(
        "git",
        ["-c", "user.email=t@example.invalid", "-c", "user.name=T", ...args],
        { cwd: harnessRoot },
      );
    await initGitClone(harnessRoot);
    const held = join(harnessRoot, ".apm", "skills", "caveman");
    const released = manifest("As released.").replace(
      "whatever-the-author-called-it",
      "caveman",
    );
    await mkdir(held, { recursive: true });
    await writeFile(join(held, "SKILL.md"), released, "utf8");
    await git("add", "-A");
    await git("commit", "-m", "first skill");

    // A real apm 0.29.0 record: one apm_package row deploying caveman and
    // prototype (tests/fixtures/README.md § Root-package canary).
    const repo = join(base, "repo");
    const deployed = join(repo, ".claude", "skills", "caveman");
    await mkdir(deployed, { recursive: true });
    await writeFile(join(deployed, "SKILL.md"), released, "utf8");
    const lockfilePath = join(repo, "apm.lock.yaml");
    await writeFile(
      lockfilePath,
      await readFile(
        new URL(
          "../fixtures/apm.lock.957-root-selection-project.yaml",
          import.meta.url,
        ),
        "utf8",
      ),
      "utf8",
    );
    const app = makeApp([{ treeRoot: repo, lockfilePath }]);

    const unedited = await check(app, { source: deployed });
    expect(await unedited.json()).toMatchObject({
      mode: "update",
      name: "caveman",
      sourceBlocker: "nothing-to-carry-back",
    });

    await writeFile(
      join(deployed, "SKILL.md"),
      manifest("Fixed in place."),
      "utf8",
    );
    const offered = await check(app, { source: deployed });
    expect(await offered.json()).toMatchObject({
      mode: "update",
      name: "caveman",
      sourceBlocker: null,
      nameBlocker: null,
    });

    const response = await importSkill(app, { source: deployed });

    expect(response.status).toBe(200);
    expect(await readFile(join(held, "SKILL.md"), "utf8")).toContain(
      "Fixed in place.",
    );
    const trees = await new HarnessGitAdapter().readMovementTrees(harnessRoot);
    expect(trees?.working.caveman).not.toBe(trees?.local.caveman);
  }, 30_000);

  it("leaves nothing behind when the copy is refused mid-tree", async () => {
    // A hard-linked file is refused, and it sits beside files the walk already
    // planned: neither the destination nor a staging leftover may appear.
    await writeFile(join(source, "shared.bin"), "shared");
    await link(join(source, "shared.bin"), join(source, "shared-alias.bin"));
    const app = makeApp();

    const response = await importSkill(app, { source });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "hard-linked-file" });
    expect(await readdir(join(harnessRoot, ".apm", "skills"))).toEqual([]);
  });
});
