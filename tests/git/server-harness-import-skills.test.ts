import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeApp } from "../helpers/node-app";

describe("harness import of several skills over HTTP", () => {
  let base: string;
  let harnessRoot: string;
  let repo: string;
  let folder: string;

  const manifest = (description = "Reviews code.") =>
    `---\nname: anything\ndescription: ${description}\n---\n\nBody.\n`;

  const skill = async (name: string, description?: string) => {
    await mkdir(join(folder, name), { recursive: true });
    await writeFile(join(folder, name, "SKILL.md"), manifest(description));
  };

  const makeApp = () =>
    nodeApp({
      HOME: base,
      MAESTRO_HOME: base,
      MAESTRO_INVENTORY_PATH: harnessRoot,
    });

  const post = (app: ReturnType<typeof makeApp>, path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  // A registered repo whose apm.lock.yaml records `foreign` as deployed by a
  // Harness that is not the connected one.
  const registerWithForeignDeploy = async (app: ReturnType<typeof makeApp>) => {
    await mkdir(join(repo, ".git"), { recursive: true });
    await writeFile(
      join(repo, "apm.lock.yaml"),
      [
        "dependencies:",
        "- virtual_path: skills/foreign",
        "  resolved_ref: v1.0.0",
        "  package_type: claude_skill",
        "  host: github.com",
        "  repo_url: someone-else/their-harness",
        "  deployed_files:",
        "  - .claude/skills/foreign",
        "  - .claude/skills/foreign/SKILL.md",
        "",
      ].join("\n"),
    );
    const response = await post(app, "/api/registry/repos", { path: repo });
    expect(response.status).toBe(201);
  };

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-import-skills-"));
    harnessRoot = join(base, "harness");
    repo = join(base, "repo");
    folder = join(repo, ".claude", "skills");
    await mkdir(join(harnessRoot, ".apm", "skills", "review"), {
      recursive: true,
    });
    await skill("code-review");
    await skill("tdd");
    await skill("notes-helper", "");
    await skill("foreign");
    await skill("review");
    await mkdir(join(folder, ".git"), { recursive: true });
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("lists each skill folder inside the chosen one with its verdict", async () => {
    const app = makeApp();
    await registerWithForeignDeploy(app);

    const response = await post(app, "/api/harness/import/skills/check", {
      source: folder,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      folderBlocker: null,
      folders: [
        { entry: "code-review", name: "code-review", refusal: null },
        { entry: "foreign", name: "foreign", refusal: "deployed-copy" },
        {
          entry: "notes-helper",
          name: "notes-helper",
          refusal: "empty-description",
        },
        { entry: "review", name: "review", refusal: "name-taken" },
        { entry: "tdd", name: "tdd", refusal: null },
      ],
    });
  });

  it("refuses a chosen folder outside the home folder and lists nothing", async () => {
    const app = makeApp();

    const response = await post(app, "/api/harness/import/skills/check", {
      source: "/etc",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      folderBlocker: "outside-root",
      folders: [],
    });
  });

  it("copies only the ticked folders, and refuses the ones that cannot land", async () => {
    const app = makeApp();
    await registerWithForeignDeploy(app);

    const response = await post(app, "/api/harness/import/skills", {
      source: folder,
      entries: ["code-review", "foreign", "review"],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      outcomes: [
        { entry: "code-review", name: "code-review", refusal: null },
        { entry: "foreign", name: "foreign", refusal: "deployed-copy" },
        { entry: "review", name: "review", refusal: "name-taken" },
      ],
    });
    expect((await readdir(join(harnessRoot, ".apm", "skills"))).sort()).toEqual(
      ["code-review", "review"],
    );
  });

  it("refuses a folder that turned bad after the scan and still lands the rest", async () => {
    const app = makeApp();
    const scan = await post(app, "/api/harness/import/skills/check", {
      source: folder,
    });
    expect(await scan.json()).toMatchObject({
      folders: expect.arrayContaining([
        { entry: "code-review", name: "code-review", refusal: null },
      ]),
    });
    await rm(join(folder, "code-review", "SKILL.md"));

    const response = await post(app, "/api/harness/import/skills", {
      source: folder,
      entries: ["code-review", "tdd"],
    });

    expect(await response.json()).toEqual({
      outcomes: [
        {
          entry: "code-review",
          name: "code-review",
          refusal: "missing-manifest",
        },
        { entry: "tdd", name: "tdd", refusal: null },
      ],
    });
    expect((await readdir(join(harnessRoot, ".apm", "skills"))).sort()).toEqual(
      ["review", "tdd"],
    );
  });

  it("refuses an entry that is not a folder directly inside the chosen one", async () => {
    const app = makeApp();

    const response = await post(app, "/api/harness/import/skills", {
      source: folder,
      entries: ["../code-review"],
    });

    expect(response.status).toBe(400);
    expect(await readdir(join(harnessRoot, ".apm", "skills"))).toEqual([
      "review",
    ]);
  });

  it("refuses an entry the chosen folder does not list", async () => {
    const app = makeApp();

    const response = await post(app, "/api/harness/import/skills", {
      source: folder,
      entries: ["missing"],
    });

    expect(await response.json()).toEqual({
      outcomes: [{ entry: "missing", name: "missing", refusal: "not-found" }],
    });
  });
});
