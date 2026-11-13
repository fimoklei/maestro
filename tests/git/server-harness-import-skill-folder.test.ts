// Import skills given one skill folder: the scan lists it as one row, and the
// import copies it as the single import did.
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
  HarnessGitAdapter,
  ReleasedContentReader,
  type SkillFolderOutcome,
  type SkillFolderScan,
} from "@maestro/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initGitClone } from "../helpers/git-fixture";
import { nodeApp } from "../helpers/node-app";

describe("Import skills over one skill folder", () => {
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

  const makeApp = () =>
    nodeApp({
      HOME: base,
      MAESTRO_HOME: base,
      MAESTRO_INVENTORY_PATH: harnessRoot,
    });

  // A registered repo is a deployed target whose apm.lock.yaml the import reads.
  const register = async (app: ReturnType<typeof makeApp>, repo: string) => {
    await mkdir(join(repo, ".git"), { recursive: true });
    const response = await post(app, "/api/registry/repos", { path: repo });
    expect(response.status).toBe(201);
  };

  const post = (app: ReturnType<typeof makeApp>, path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const scan = async (
    app: ReturnType<typeof makeApp>,
    folder: string,
  ): Promise<SkillFolderScan> => {
    const response = await post(app, "/api/harness/import/skills/check", {
      source: folder,
    });
    expect(response.status).toBe(200);
    return (await response.json()) as SkillFolderScan;
  };

  // Scans the one folder, then imports the row it lists, replacing a held
  // skill only when the scan says it would.
  const importFolder = async (
    app: ReturnType<typeof makeApp>,
    folder: string,
  ): Promise<SkillFolderOutcome> => {
    const listed = await scan(app, folder);
    const [row] = listed.folders;
    if (row === undefined || listed.folder === null) {
      throw new Error("The scan listed no row.");
    }
    const response = await post(app, "/api/harness/import/skills", {
      source: listed.folder,
      entries: [{ entry: row.entry, replace: row.replaces }],
    });
    expect(response.status).toBe(200);
    const { outcomes } = (await response.json()) as {
      outcomes: SkillFolderOutcome[];
    };
    const [outcome] = outcomes;
    if (outcome === undefined) throw new Error("The import answered no row.");
    return outcome;
  };

  it("copies nested content and the executable bit, and skips .git", async () => {
    const app = makeApp();

    const outcome = await importFolder(app, source);

    expect(outcome).toEqual({
      entry: "Code Review",
      name: "code-review",
      refusal: null,
      replaces: false,
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

    await importFolder(app, source);

    const landed = join(harnessRoot, ".apm", "skills", "code-review");
    expect(await readFile(join(landed, "SKILL.md"), "utf8")).toContain(
      "name: code-review",
    );
  });

  it("refuses a recorded copy whose record names no origin", async () => {
    const repo = join(base, "repo");
    const deployed = join(repo, ".claude", "skills", "code-review");
    await mkdir(deployed, { recursive: true });
    await writeFile(join(deployed, "SKILL.md"), manifest(), "utf8");
    await writeFile(
      join(repo, "apm.lock.yaml"),
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
    const app = makeApp();
    await register(app, repo);

    expect(await scan(app, deployed)).toEqual({
      folderBlocker: "origin-unproven",
      folder: null,
      folders: [],
    });
  });

  it("lets a hand-authored skill through the same folder a deploy would use (#667)", async () => {
    const repo = join(base, "repo");
    const authored = join(repo, ".claude", "skills", "code-review");
    await mkdir(authored, { recursive: true });
    await writeFile(join(authored, "SKILL.md"), manifest(), "utf8");
    await writeFile(join(repo, "apm.lock.yaml"), "dependencies: []\n", "utf8");
    const app = makeApp();
    await register(app, repo);

    expect(await importFolder(app, authored)).toMatchObject({ refusal: null });
  });

  it("refuses a harness whose skills folder points outside the harness", async () => {
    const elsewhere = join(base, "elsewhere");
    await mkdir(elsewhere, { recursive: true });
    await rm(join(harnessRoot, ".apm"), { recursive: true });
    await mkdir(join(harnessRoot, ".apm"), { recursive: true });
    await symlink(elsewhere, join(harnessRoot, ".apm", "skills"));
    const app = makeApp();

    expect(await importFolder(app, source)).toMatchObject({
      refusal: "destination-unsafe",
    });
    expect(await readdir(elsewhere)).toEqual([]);
  });

  it("rebuilds a manifest whose name is not a plain scalar", async () => {
    // A `name` that is a mapping needs the document rewrite, not the textual one.
    await writeFile(
      join(source, "SKILL.md"),
      "---\nname:\n  first: a\ndescription: Reviews code.\n---\n",
      "utf8",
    );
    const app = makeApp();

    expect(await importFolder(app, source)).toMatchObject({ refusal: null });
    const landed = join(harnessRoot, ".apm", "skills", "code-review");
    expect(await readFile(join(landed, "SKILL.md"), "utf8")).toContain(
      "name: code-review",
    );
  });

  // The whole chain in one case (#732): the seams are the value.
  it("carries an edited deployed copy back into the Harness as a pending change", async () => {
    const run = promisify(execFile);
    const git = (...args: string[]) =>
      run(
        "git",
        ["-c", "user.email=t@example.invalid", "-c", "user.name=T", ...args],
        { cwd: harnessRoot },
      );
    // Offline: the origin URL is never fetched.
    await initGitClone(harnessRoot);
    const held = join(harnessRoot, ".apm", "skills", "code-review");
    await mkdir(held, { recursive: true });
    await writeFile(join(held, "SKILL.md"), manifest("As released."), "utf8");
    await writeFile(join(held, "old-note.md"), "dropped\n", "utf8");
    await git("add", "-A");
    await git("commit", "-m", "first skill");

    const repo = join(base, "repo");
    const deployed = join(repo, ".claude", "skills", "code-review");
    await mkdir(deployed, { recursive: true });
    await writeFile(
      join(deployed, "SKILL.md"),
      manifest("Fixed in place."),
      "utf8",
    );
    await writeFile(
      join(repo, "apm.lock.yaml"),
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
    const app = makeApp();
    await register(app, repo);

    expect((await scan(app, deployed)).folders).toMatchObject([
      { name: "code-review", refusal: null, replaces: true },
    ]);

    expect(await importFolder(app, deployed)).toMatchObject({
      name: "code-review",
      refusal: null,
      replaces: true,
    });
    expect(await readFile(join(held, "SKILL.md"), "utf8")).toContain(
      "Fixed in place.",
    );
    expect(await readdir(held)).toEqual(["SKILL.md"]);
    const trees = await new HarnessGitAdapter({
      released: new ReleasedContentReader(),
    }).readMovementTrees(harnessRoot);
    expect(trees?.skill.working["code-review"]).not.toBe(
      trees?.skill.local["code-review"],
    );
  }, 30_000);

  // A Root package record names no one skill, so the name comes from its
  // deployed files (#967).
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

    // A real apm 0.29.0 record: one apm_package row deploying caveman and prototype.
    const repo = join(base, "repo");
    const deployed = join(repo, ".claude", "skills", "caveman");
    await mkdir(deployed, { recursive: true });
    await writeFile(join(deployed, "SKILL.md"), released, "utf8");
    await writeFile(
      join(repo, "apm.lock.yaml"),
      await readFile(
        new URL(
          "../fixtures/apm.lock.957-root-selection-project.yaml",
          import.meta.url,
        ),
        "utf8",
      ),
      "utf8",
    );
    const app = makeApp();
    await register(app, repo);

    expect((await scan(app, deployed)).folders).toMatchObject([
      { name: "caveman", refusal: "nothing-to-carry-back", replaces: true },
    ]);

    await writeFile(
      join(deployed, "SKILL.md"),
      manifest("Fixed in place."),
      "utf8",
    );
    expect(await importFolder(app, deployed)).toMatchObject({
      name: "caveman",
      refusal: null,
      replaces: true,
    });
    expect(await readFile(join(held, "SKILL.md"), "utf8")).toContain(
      "Fixed in place.",
    );
    const trees = await new HarnessGitAdapter({
      released: new ReleasedContentReader(),
    }).readMovementTrees(harnessRoot);
    expect(trees?.skill.working.caveman).not.toBe(trees?.skill.local.caveman);
  }, 30_000);

  it("leaves nothing behind when the copy is refused mid-tree", async () => {
    // Neither the destination nor a staging leftover may appear.
    await writeFile(join(source, "shared.bin"), "shared");
    await link(join(source, "shared.bin"), join(source, "shared-alias.bin"));
    const app = makeApp();

    expect(await importFolder(app, source)).toMatchObject({
      refusal: "hard-linked-file",
    });
    expect(await readdir(join(harnessRoot, ".apm", "skills"))).toEqual([]);
  });
});
