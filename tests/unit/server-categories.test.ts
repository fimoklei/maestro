// Settings › Categories over HTTP: the composition over an in-memory disk and
// Harness.
import type { CategoryList } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryApp } from "../helpers/in-memory-app";

const HARNESS = "/harness";
const CONFIG = "/maestro-home/config.json";
const ORIGIN = "git@github.com:fimoklei/agent-harness.git";

type Ref = { type: "skill" | "prompt"; name: string };

const world = ({ connected = true }: { connected?: boolean } = {}) => {
  const env: NodeJS.ProcessEnv = {
    HOME: "/home",
    MAESTRO_HOME: "/maestro-home",
  };
  if (connected) env.MAESTRO_INVENTORY_PATH = HARNESS;
  const fs = new InMemoryFileSystem({
    directories: {
      [HARNESS]: HARNESS,
      "/other-harness": "/other-harness",
      "/second-clone": "/second-clone",
      "/consumer": "/consumer",
      "/consumer/.git": "/consumer/.git",
    },
  });
  const harness = new InMemoryHarnessGit();
  const app = inMemoryApp({ env, fs, git: { harness } });
  // Points Maestro at another clone, as Change Harness location does.
  const pointAt = (root: string, originUrl: string | null) => {
    env.MAESTRO_INVENTORY_PATH = root;
    harness.root = root;
    harness.originUrl = originUrl;
  };
  // The latest release holds these; the Working harness holds nothing yet.
  const release = (skills: string[], prompts: string[] = []) => {
    harness.commit(
      "released",
      Object.fromEntries(skills.map((name) => [name, `# ${name}\n`])),
      {
        prompts: Object.fromEntries(
          prompts.map((name) => [name, `# ${name}\n`]),
        ),
      },
    );
    harness.tags = [{ name: "v1.0.0", commit: "released" }];
  };
  // Imported into the Working harness on disk, not released yet.
  const draft = async ({ type, name }: Ref) => {
    const dir = `${HARNESS}/${type === "skill" ? ".apm/skills" : ".maestro/prompts"}`;
    await fs.ensureDir(dir);
    if (type === "skill") await fs.ensureDir(`${dir}/${name}`);
    else await fs.writeFile(`${dir}/${name}.md`, `# ${name}\n`);
  };
  return { app, fs, harness, pointAt, release, draft };
};

type App = ReturnType<typeof world>["app"];

const read = (app: App) => app.request("/api/categories");

const add = (app: App, name: unknown) =>
  app.request("/api/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

const assign = (app: App, items: Ref[], category: string | null) =>
  app.request("/api/categories/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, category }),
  });

const rename = (app: App, from: unknown, to: unknown) =>
  app.request("/api/categories/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to }),
  });

const remove = (app: App, name: unknown, moveTo: unknown) =>
  app.request("/api/categories/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, moveTo }),
  });

const skill = (name: string): Ref => ({ type: "skill", name });
const prompt = (name: string): Ref => ({ type: "prompt", name });

const readConfig = (fs: InMemoryFileSystem) => fs.readFile(CONFIG);

const listOf = async (app: App) =>
  (await (await read(app)).json()) as CategoryList;

const namesOf = async (app: App) => {
  const res = await read(app);
  const list = (await res.json()) as CategoryList;
  return list.categories.map((category) => category.name);
};

describe("categories over HTTP", () => {
  it("lists no categories for a Harness that has none yet", async () => {
    const { app } = world();

    const res = await read(app);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      categories: [],
      assignments: [],
    } satisfies CategoryList);
  });

  it("adds a trimmed name and lists every category alphabetically, ignoring case", async () => {
    const { app } = world();

    await add(app, "Writing");
    await add(app, "code review");
    const res = await add(app, "  Planning ");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      categories: [
        { name: "code review", skills: 0, prompts: 0 },
        { name: "Planning", skills: 0, prompts: 0 },
        { name: "Writing", skills: 0, prompts: 0 },
      ],
      assignments: [],
      added: "Planning",
    });
    await expect(namesOf(app)).resolves.toEqual([
      "code review",
      "Planning",
      "Writing",
    ]);
  });

  it("refuses a name that exists ignoring case, and names the existing category", async () => {
    const { app } = world();
    await add(app, "Code review");

    const res = await add(app, " code REVIEW ");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "name-exists",
      existing: "Code review",
    });
    await expect(namesOf(app)).resolves.toEqual(["Code review"]);
  });

  it.each([
    ["an empty name", ""],
    ["a name of spaces only", "   "],
    ["a name over 64 characters", "x".repeat(65)],
    ["a name with a line break", "Code\nreview"],
    ["a name with a tab", "Code\treview"],
    ["the name of the No category group, in any case", " no CATEGORY "],
  ])("refuses %s", async (_, name) => {
    const { app } = world();

    const res = await add(app, name);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name-invalid" });
    await expect(namesOf(app)).resolves.toEqual([]);
  });

  it("accepts a name of exactly 64 characters", async () => {
    const { app } = world();

    const res = await add(app, "x".repeat(64));

    expect(res.status).toBe(200);
  });

  it("refuses a body without a name as a request of the wrong shape", async () => {
    const { app } = world();

    const res = await add(app, 3);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid-body" });
  });

  it("refuses a read and an add while no Harness is connected", async () => {
    const { app } = world({ connected: false });

    const reading = await read(app);
    const adding = await add(app, "Planning");

    expect(reading.status).toBe(409);
    expect(await reading.json()).toEqual({ error: "not-configured" });
    expect(adding.status).toBe(409);
    expect(await adding.json()).toEqual({ error: "not-configured" });
  });

  describe("assign", () => {
    it("gives several items one category, counts them, and removes the category with none", async () => {
      const { app, release } = world();
      release(["tdd", "grill", "research"], ["pr-review"]);
      await add(app, "Planning");
      await add(app, "Writing");

      const assigned = await assign(
        app,
        [skill("tdd"), skill("grill"), prompt("pr-review")],
        "Planning",
      );
      await assign(app, [skill("research")], "Writing");
      const removed = await assign(app, [skill("research")], null);

      const afterAssign = await assigned.json();
      expect(assigned.status).toBe(200);
      expect(afterAssign).toEqual({
        categories: [
          { name: "Planning", skills: 2, prompts: 1 },
          { name: "Writing", skills: 0, prompts: 0 },
        ],
        assignments: [
          { type: "skill", name: "tdd", category: "Planning" },
          { type: "skill", name: "grill", category: "Planning" },
          { type: "prompt", name: "pr-review", category: "Planning" },
        ],
      } satisfies CategoryList);
      expect(removed.status).toBe(200);
      await expect(listOf(app)).resolves.toEqual(afterAssign);
    });

    it("moves an item that has a category to the new one", async () => {
      const { app, release } = world();
      release(["tdd"]);
      await add(app, "Planning");
      await add(app, "Writing");
      await assign(app, [skill("tdd")], "Planning");

      await assign(app, [skill("tdd")], "Writing");

      expect((await listOf(app)).assignments).toEqual([
        { type: "skill", name: "tdd", category: "Writing" },
      ]);
    });

    it("stores the category's own name when the request differs in case", async () => {
      const { app, release } = world();
      release(["tdd"]);
      await add(app, "Code review");

      await assign(app, [skill("tdd")], "code REVIEW");

      expect((await listOf(app)).assignments).toEqual([
        { type: "skill", name: "tdd", category: "Code review" },
      ]);
    });

    it("refuses an unknown category and changes nothing", async () => {
      const { app, release } = world();
      release(["tdd"]);
      await add(app, "Planning");

      const res = await assign(app, [skill("tdd")], "Writing");

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "category-not-found" });
      expect((await listOf(app)).assignments).toEqual([]);
    });

    it("refuses an item neither the latest release nor the Working harness holds", async () => {
      const { app, release } = world();
      release(["tdd"]);
      await add(app, "Planning");

      const res = await assign(app, [skill("tdd"), skill("gone")], "Planning");

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "item-not-found" });
      expect((await listOf(app)).assignments).toEqual([]);
    });

    it("refuses a request of the wrong shape", async () => {
      const { app } = world();

      const noItems = await assign(app, [], null);
      const badType = await app.request("/api/categories/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ type: "hook", name: "x" }],
          category: null,
        }),
      });

      expect(noItems.status).toBe(400);
      expect(await noItems.json()).toMatchObject({ error: "invalid-body" });
      expect(badType.status).toBe(400);
    });

    it("writes nothing to the Harness", async () => {
      const { app, harness, release } = world();
      release(["tdd"]);
      const before = JSON.stringify({
        tags: harness.tags,
        working: harness.working,
        published: harness.published,
      });
      await add(app, "Planning");

      await assign(app, [skill("tdd")], "Planning");

      expect(
        JSON.stringify({
          tags: harness.tags,
          working: harness.working,
          published: harness.published,
        }),
      ).toBe(before);
    });
  });

  describe("rename", () => {
    it("renames a category, and every assigned skill and prompt follows", async () => {
      const { app, release } = world();
      release(["tdd"], ["pr-review"]);
      await add(app, "Planning");
      await assign(app, [skill("tdd"), prompt("pr-review")], "Planning");

      const res = await rename(app, "Planning", "  Design ");

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        categories: [{ name: "Design", skills: 1, prompts: 1 }],
        assignments: [
          { type: "skill", name: "tdd", category: "Design" },
          { type: "prompt", name: "pr-review", category: "Design" },
        ],
      } satisfies CategoryList);
    });

    it("refuses a category that does not exist", async () => {
      const { app } = world();
      await add(app, "Planning");

      const res = await rename(app, "Writing", "Docs");

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "category-not-found" });
      await expect(namesOf(app)).resolves.toEqual(["Planning"]);
    });

    it.each([
      ["an empty name", " "],
      ["a name over 64 characters", "x".repeat(65)],
      ["a name with a line break", "Plan\nning"],
      ["the name of the No category group", "No category"],
    ])("refuses %s", async (_, to) => {
      const { app } = world();
      await add(app, "Planning");

      const res = await rename(app, "Planning", to);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "name-invalid" });
      await expect(namesOf(app)).resolves.toEqual(["Planning"]);
    });

    it("refuses a request of the wrong shape", async () => {
      const { app } = world();

      const res = await rename(app, "Planning", null);

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid-body" });
    });
  });

  describe("delete", () => {
    it("refuses a category that does not exist", async () => {
      const { app } = world();
      await add(app, "Planning");

      const res = await remove(app, "Writing", null);

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "category-not-found" });
    });

    it("refuses a destination that does not exist, or is the category itself", async () => {
      const { app, release } = world();
      release(["tdd"]);
      await add(app, "Planning");
      await assign(app, [skill("tdd")], "Planning");

      const unknown = await remove(app, "Planning", "Writing");
      const itself = await remove(app, "Planning", "planning");

      expect(unknown.status).toBe(404);
      expect(await unknown.json()).toEqual({ error: "category-not-found" });
      expect(itself.status).toBe(404);
      expect(await itself.json()).toEqual({ error: "category-not-found" });
      expect((await listOf(app)).categories).toEqual([
        { name: "Planning", skills: 1, prompts: 0 },
      ]);
    });

    it("refuses a request of the wrong shape", async () => {
      const { app } = world();

      const res = await app.request("/api/categories/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Planning" }),
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid-body" });
    });
  });

  it("carries a list through add, rename, assign and delete, with the counts after each step", async () => {
    const { app, release } = world();
    release(["tdd", "grill", "research"], ["pr-review"]);
    const counts = async () => (await listOf(app)).categories;

    await add(app, "code review");
    await add(app, "Planning");
    await add(app, "Writing");
    expect(await counts()).toEqual([
      { name: "code review", skills: 0, prompts: 0 },
      { name: "Planning", skills: 0, prompts: 0 },
      { name: "Writing", skills: 0, prompts: 0 },
    ]);

    const duplicate = await add(app, "PLANNING");
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({
      error: "name-exists",
      existing: "Planning",
    });

    const caseOnly = await rename(app, "code review", "Code review");
    expect(caseOnly.status).toBe(200);
    expect((await counts()).map(({ name }) => name)).toEqual([
      "Code review",
      "Planning",
      "Writing",
    ]);

    const onto = await rename(app, "Code review", " writing ");
    expect(onto.status).toBe(409);
    expect(await onto.json()).toEqual({
      error: "name-exists",
      existing: "Writing",
    });

    await assign(app, [skill("tdd"), skill("grill")], "Planning");
    await assign(app, [skill("research"), prompt("pr-review")], "Code review");
    expect(await counts()).toEqual([
      { name: "Code review", skills: 1, prompts: 1 },
      { name: "Planning", skills: 2, prompts: 0 },
      { name: "Writing", skills: 0, prompts: 0 },
    ]);

    const merged = await remove(app, "Planning", "code REVIEW");
    expect(merged.status).toBe(200);
    expect(await counts()).toEqual([
      { name: "Code review", skills: 3, prompts: 1 },
      { name: "Writing", skills: 0, prompts: 0 },
    ]);
    expect((await listOf(app)).assignments).toContainEqual({
      type: "skill",
      name: "tdd",
      category: "Code review",
    });

    const toNone = await remove(app, "Code review", null);
    expect(toNone.status).toBe(200);
    expect(await listOf(app)).toEqual({
      categories: [{ name: "Writing", skills: 0, prompts: 0 }],
      assignments: [],
    } satisfies CategoryList);
  });

  describe("an item the Harness no longer holds", () => {
    it("keeps the category of an item only in the Working harness", async () => {
      const { app, release, draft } = world();
      release(["tdd"]);
      await draft(skill("drafted"));
      await draft(prompt("draft-prompt"));
      await add(app, "Planning");

      const res = await assign(
        app,
        [skill("drafted"), prompt("draft-prompt")],
        "Planning",
      );

      expect(res.status).toBe(200);
      expect((await listOf(app)).categories).toEqual([
        { name: "Planning", skills: 1, prompts: 1 },
      ]);
    });

    it("skips an entry for an item in neither on read, and drops it on the next save", async () => {
      const { app, fs, harness, release } = world();
      release(["tdd", "renamed-away"]);
      await add(app, "Planning");
      await assign(app, [skill("tdd"), skill("renamed-away")], "Planning");
      // The skill is renamed outside Maestro and released under its new name.
      harness.commit("renamed", { tdd: "# tdd\n", "new-name": "# new\n" });
      harness.tags = [{ name: "v1.1.0", commit: "renamed" }];

      const reading = await listOf(app);
      const saved = async () => JSON.parse(String(await readConfig(fs)));
      const beforeSave = await saved();
      await add(app, "Writing");

      expect(reading).toEqual({
        categories: [{ name: "Planning", skills: 1, prompts: 0 }],
        assignments: [{ type: "skill", name: "tdd", category: "Planning" }],
      } satisfies CategoryList);
      expect(beforeSave.categories[0].assignments).toHaveLength(2);
      expect((await saved()).categories[0].assignments).toEqual([
        { type: "skill", name: "tdd", category: "Planning" },
      ]);
    });

    it("drops nothing and refuses no item while the Harness cannot be read", async () => {
      const { app, fs, harness, release } = world();
      release(["tdd"]);
      await add(app, "Planning");
      await assign(app, [skill("tdd")], "Planning");
      harness.tags = null;

      const assigned = await assign(app, [skill("unseen")], "Planning");
      const reading = await listOf(app);
      await add(app, "Writing");

      expect(assigned.status).toBe(200);
      expect(reading.categories).toEqual([
        { name: "Planning", skills: 2, prompts: 0 },
      ]);
      const saved = JSON.parse(String(await readConfig(fs)));
      expect(saved.categories[0].assignments).toHaveLength(2);
    });
  });

  describe("a malformed categories section", () => {
    const broken = JSON.stringify({
      repos: [],
      categories: [{ names: "Planning" }],
    });

    it("fails the read and every write, and leaves the file as it was", async () => {
      const { app, fs } = world();
      await fs.writeFile(CONFIG, broken);

      const reading = await read(app);
      const adding = await add(app, "Writing");

      expect(reading.status).toBe(500);
      expect(await reading.json()).toEqual({
        error: "categories-unreadable",
        configPath: CONFIG,
      });
      expect(adding.status).toBe(500);
      expect(await adding.json()).toEqual({
        error: "categories-unreadable",
        configPath: CONFIG,
      });
      expect(await fs.readFile(CONFIG)).toBe(broken);
    });

    it("leaves the other routes working, and survives their writes", async () => {
      const { app, fs } = world();
      await fs.writeFile(CONFIG, broken);

      const config = await app.request("/api/inventory/config");
      const registered = await app.request("/api/registry/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/consumer" }),
      });

      expect(config.status).toBe(200);
      expect(registered.status).toBe(201);
      const saved = JSON.parse((await fs.readFile(CONFIG)) ?? "{}");
      expect(saved.categories).toEqual([{ names: "Planning" }]);
    });
  });

  describe("one list per Harness", () => {
    it("keeps two lists for two Harnesses, and finds each again on return", async () => {
      const { app, pointAt } = world();
      await add(app, "Planning");

      pointAt("/other-harness", "git@github.com:fimoklei/other-harness.git");
      await add(app, "Writing");
      const other = await namesOf(app);
      pointAt(HARNESS, ORIGIN);

      expect(other).toEqual(["Writing"]);
      await expect(namesOf(app)).resolves.toEqual(["Planning"]);
    });

    it("finds the list of a second clone of the same repository", async () => {
      const { app, pointAt } = world();
      await add(app, "Planning");

      pointAt("/second-clone", ORIGIN);

      await expect(namesOf(app)).resolves.toEqual(["Planning"]);
    });

    it("keeps a Harness with no GitHub origin apart by its root", async () => {
      const { app, pointAt } = world();
      pointAt("/other-harness", null);
      await add(app, "Local only");

      pointAt(HARNESS, ORIGIN);
      const connected = await namesOf(app);
      pointAt("/other-harness", null);

      expect(connected).toEqual([]);
      await expect(namesOf(app)).resolves.toEqual(["Local only"]);
    });

    it("finds a Harness whose origin changed by its root, and saves the new origin", async () => {
      const { app, pointAt } = world();
      await add(app, "Planning");
      const renamed = "git@github.com:fimoklei/renamed-harness.git";

      pointAt(HARNESS, renamed);
      await add(app, "Writing");
      pointAt("/second-clone", renamed);

      await expect(namesOf(app)).resolves.toEqual(["Planning", "Writing"]);
    });
  });
});
