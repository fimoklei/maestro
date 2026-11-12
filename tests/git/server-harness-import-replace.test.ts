// A batch import replaces a held skill or prompt only where the Contributor
// ticked it, and the replaced item then reads as a Changed proposal.
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { git, rowsOf, useHarnessStages } from "../helpers/harness-stages";

describe("batch import over a held item", { timeout: 40_000 }, () => {
  const stages = useHarnessStages();

  const post = (
    app: ReturnType<typeof stages.makeApp>,
    path: string,
    body: unknown,
  ) =>
    app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  // A teammate's `tdd` lives in the Harness; the Contributor's own copy sits
  // in a folder of their skills, next to one the Harness does not hold.
  const skillsFolder = async () => {
    const folder = join(stages.base, "my-skills");
    for (const [name, description] of [
      ["tdd", "My own take."],
      ["write-spec", "Writes a spec."],
    ] as const) {
      await mkdir(join(folder, name), { recursive: true });
      await writeFile(
        join(folder, name, "SKILL.md"),
        `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`,
      );
    }
    return folder;
  };

  const heldSkill = () =>
    readFile(join(stages.root, ".apm", "skills", "tdd", "SKILL.md"), "utf8");

  it("lists a folder whose name the Harness holds as one that replaces it", async () => {
    const app = stages.makeApp();
    const source = await skillsFolder();

    const response = await post(app, "/api/harness/import/skills/check", {
      source,
    });

    expect(await response.json()).toEqual({
      folderBlocker: null,
      folder: await realpath(source),
      folders: [
        {
          entry: "tdd",
          name: "tdd",
          refusal: null,
          replaces: true,
          category: null,
        },
        {
          entry: "write-spec",
          name: "write-spec",
          refusal: null,
          replaces: false,
          category: null,
        },
      ],
    });
  });

  it("replaces a ticked held skill, which then reads as Changed", async () => {
    const app = stages.makeApp();
    const source = await skillsFolder();

    const response = await post(app, "/api/harness/import/skills", {
      source,
      entries: [
        { entry: "tdd", replace: true },
        { entry: "write-spec", replace: false },
      ],
    });

    expect(await response.json()).toEqual({
      outcomes: [
        { entry: "tdd", name: "tdd", refusal: null, replaces: true },
        {
          entry: "write-spec",
          name: "write-spec",
          refusal: null,
          replaces: false,
        },
      ],
    });
    expect(await heldSkill()).toContain("My own take.");
    expect(rowsOf((await stages.refresh(app)).stages.proposal)).toMatchObject([
      { name: "tdd", change: "edit" },
      { name: "write-spec", change: "addition" },
    ]);
  });

  it("leaves a held skill alone when the folder is sent without replace", async () => {
    const app = stages.makeApp();
    const source = await skillsFolder();

    const response = await post(app, "/api/harness/import/skills", {
      source,
      entries: [{ entry: "tdd", replace: false }],
    });

    expect(await response.json()).toEqual({
      outcomes: [
        { entry: "tdd", name: "tdd", refusal: "name-taken", replaces: false },
      ],
    });
    expect(await heldSkill()).toContain("as published");
  });

  it("refuses to replace a held skill with uncommitted changes in the clone", async () => {
    const app = stages.makeApp();
    const source = await skillsFolder();
    await stages.writeSkill("tdd", "work in progress");

    const response = await post(app, "/api/harness/import/skills", {
      source,
      entries: [{ entry: "tdd", replace: true }],
    });

    expect(await response.json()).toEqual({
      outcomes: [
        {
          entry: "tdd",
          name: "tdd",
          refusal: "harness-copy-uncommitted",
          replaces: true,
        },
      ],
    });
    expect(await heldSkill()).toContain("work in progress");
  });

  describe("prompts", () => {
    const promptPath = () =>
      join(stages.root, ".maestro", "prompts", "commit-tips.md");

    const draft = (name: string) => ({
      name,
      frontmatter: "",
      description: "My tips",
      text: "Write small commits.\n",
      example: "",
    });

    // The teammate's prompt is published, so a replaced one is an edit.
    const publishPrompt = async () => {
      await mkdir(join(stages.root, ".maestro", "prompts"), {
        recursive: true,
      });
      await writeFile(
        promptPath(),
        "---\ndescription: Team tips\n---\nKeep it short.\n",
      );
      await git(stages.root, "add", ".");
      await git(stages.root, "commit", "-m", "a prompt");
      await git(stages.root, "push", "origin", "HEAD:main");
    };

    it("replaces a ticked held prompt, which then reads as Changed", async () => {
      await publishPrompt();
      const app = stages.makeApp();

      const response = await post(app, "/api/harness/prompts/import", {
        prompts: [
          { ...draft("commit-tips"), replace: true },
          { ...draft("release-notes"), replace: false },
        ],
      });

      expect(await response.json()).toEqual({
        outcomes: [
          { name: "commit-tips", imported: true, mode: "update" },
          { name: "release-notes", imported: true, mode: "add" },
        ],
      });
      expect(await readFile(promptPath(), "utf8")).toContain(
        "Write small commits.",
      );
      expect(rowsOf((await stages.refresh(app)).stages.proposal)).toMatchObject(
        [
          { type: "prompt", name: "commit-tips", change: "edit" },
          { type: "prompt", name: "release-notes", change: "addition" },
        ],
      );
    });

    it("leaves a held prompt alone when it is sent without replace", async () => {
      await publishPrompt();
      const app = stages.makeApp();

      const response = await post(app, "/api/harness/prompts/import", {
        prompts: [{ ...draft("commit-tips"), replace: false }],
      });

      expect(await response.json()).toEqual({
        outcomes: [
          { name: "commit-tips", imported: false, refusal: "prompt-taken" },
        ],
      });
      expect(await readFile(promptPath(), "utf8")).toContain("Keep it short.");
    });
  });
});
