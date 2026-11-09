// Import several prompts at once over the real disk: one call, one outcome per file.
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeApp } from "../helpers/node-app";

describe("import prompts HTTP route", () => {
  let base: string;
  let harnessRoot: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "maestro-import-prompts-"));
    harnessRoot = join(base, "harness");
    await mkdir(harnessRoot, { recursive: true });
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

  const importPrompts = (app: ReturnType<typeof makeApp>, body: unknown) =>
    app.request("/api/harness/prompts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const draft = (fields: Partial<Record<string, string>>) => ({
    name: "release-notes",
    frontmatter: "",
    description: "Draft the release notes",
    text: "Draft the notes for $ARGUMENTS.\n",
    example: "",
    replace: false,
    ...fields,
  });

  const promptsFolder = () => join(harnessRoot, ".maestro", "prompts");

  it("writes each good file and refuses a broken one by its first rule", async () => {
    const app = makeApp();

    const response = await importPrompts(app, {
      prompts: [
        draft({}),
        draft({ name: "", description: "", text: "" }),
        draft({ name: "onboarding", description: "", text: "" }),
        draft({ name: "standup-notes", description: "Run the standup" }),
      ],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      outcomes: [
        { name: "release-notes", imported: true, mode: "add" },
        { name: "", imported: false, refusal: "empty-name" },
        { name: "onboarding", imported: false, refusal: "empty-description" },
        { name: "standup-notes", imported: true, mode: "add" },
      ],
    });
    expect((await readdir(promptsFolder())).sort()).toEqual([
      "release-notes.md",
      "standup-notes.md",
    ]);
    expect(
      await readFile(join(promptsFolder(), "release-notes.md"), "utf8"),
    ).toBe(
      "---\ndescription: Draft the release notes\n---\nDraft the notes for $ARGUMENTS.\n",
    );
  });

  it("leaves a prompt the Harness holds as it is", async () => {
    await mkdir(promptsFolder(), { recursive: true });
    await writeFile(join(promptsFolder(), "commit-tips.md"), "Keep me.\n");
    const app = makeApp();

    const response = await importPrompts(app, {
      prompts: [draft({ name: "commit-tips" }), draft({})],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      outcomes: [
        { name: "commit-tips", imported: false, refusal: "prompt-taken" },
        { name: "release-notes", imported: true, mode: "add" },
      ],
    });
    expect(
      await readFile(join(promptsFolder(), "commit-tips.md"), "utf8"),
    ).toBe("Keep me.\n");
  });

  it("refuses the second of two files with one name", async () => {
    const app = makeApp();

    const response = await importPrompts(app, {
      prompts: [draft({}), draft({ text: "Another text.\n" })],
    });

    expect(await response.json()).toEqual({
      outcomes: [
        { name: "release-notes", imported: true, mode: "add" },
        { name: "release-notes", imported: false, refusal: "prompt-taken" },
      ],
    });
  });

  it("refuses an empty batch as a request shape", async () => {
    const app = makeApp();

    const response = await importPrompts(app, { prompts: [] });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid-body" });
  });

  it("refuses the whole batch without a connected Harness", async () => {
    const app = nodeApp({ HOME: base, MAESTRO_HOME: base });

    const response = await importPrompts(app, { prompts: [draft({})] });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "not-configured" });
  });
});
