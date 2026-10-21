import { describe, expect, it } from "vitest";
import { InFlightLocks } from "../deploy/in-flight-locks";
import { InMemoryFileSystem } from "../registry/file-system.fake";
import { ImportPrompt } from "./import-prompt";
import { draftPrompt, readPromptFile } from "./prompt-file";

const ROOT = "/harness";
const PROMPTS = "/harness/.maestro/prompts";

function build(overrides?: {
  root?: string | undefined;
  seed?: ConstructorParameters<typeof InMemoryFileSystem>[0];
  writeFails?: boolean;
  locks?: InFlightLocks;
}) {
  const fs = new InMemoryFileSystem(
    overrides?.seed ?? { directories: { [ROOT]: ROOT } },
  );
  const importPrompt = new ImportPrompt({
    resolveRoot: async () =>
      overrides && "root" in overrides ? overrides.root : ROOT,
    fs: {
      realpath: (path) => fs.realpath(path),
      exists: (path) => fs.exists(path),
      // Like `mkdir -p`: an existing folder, or a link to one, stays as it is.
      ensureDir: async (path) => {
        const known = await fs.realpath(path).then(
          () => true,
          () => false,
        );
        if (!known) {
          await fs.ensureDir(path);
        }
      },
      writeFile: async (path, contents) => {
        if (overrides?.writeFails === true) {
          throw new Error("EACCES");
        }
        await fs.writeFile(path, contents);
      },
    },
    locks: overrides?.locks ?? new InFlightLocks(),
  });
  return { importPrompt, fs };
}

const VALID = {
  name: "review-pr",
  description: "Review a pull request.",
  text: "Review $ARGUMENTS.\n",
};

// Shaped after prompts found in real tool folders.
const FIXTURES: { fileName: string; raw: string }[] = [
  {
    fileName: "review-pr.prompt.md",
    raw: "---\r\ndescription: Review the open pull request\r\n---\r\nRead the diff.\r\nList the risks.\r\n",
  },
  {
    fileName: "commit.md",
    raw: "---\ndescription: Write a commit message\nallowed-tools: Bash(git diff:*)\nargument-hint: '[scope]'\nmodel: haiku\n---\nWrite a commit message for $ARGUMENTS.\nUse $1 as the scope.\n",
  },
  {
    fileName: "explain.txt",
    raw: "---\ndescription: |\n  Explain the code\n  in plain words\n---\nExplain $ARGUMENTS to a new teammate.",
  },
  {
    fileName: "long-plan.prompt.md",
    raw: `---\ndescription: Plan a large change\n---\n${"Step: read, plan, check.\n".repeat(3000)}`,
  },
];

describe("ImportPrompt.execute", () => {
  it.each(FIXTURES)(
    "writes $fileName so it reads back unchanged",
    async ({ fileName, raw }) => {
      const { importPrompt, fs } = build();
      const draft = draftPrompt(raw, fileName);

      await expect(importPrompt.execute(draft)).resolves.toEqual({
        ok: true,
        mode: "add",
        name: draft.name,
      });
      const written = await fs.readFile(`${PROMPTS}/${draft.name}.md`);
      expect(written).not.toBeNull();
      expect(readPromptFile(written ?? "")).toEqual({
        description: draft.description,
        text: draft.text,
      });
    },
  );

  it("writes a front matter block holding only the description", async () => {
    const { importPrompt, fs } = build();

    await importPrompt.execute(VALID);

    expect(await fs.readFile(`${PROMPTS}/review-pr.md`)).toBe(
      "---\ndescription: Review a pull request.\n---\nReview $ARGUMENTS.\n",
    );
  });

  it("reads back a description holding YAML-special characters", async () => {
    const { importPrompt, fs } = build();
    const description = `Fix: the "build" #1 issue's 'tests'`;

    await importPrompt.execute({ ...VALID, description });

    const written = await fs.readFile(`${PROMPTS}/review-pr.md`);
    expect(readPromptFile(written ?? "").description).toBe(description);
  });

  it("overwrites a taken name as an update", async () => {
    const { importPrompt, fs } = build({
      seed: {
        directories: { [ROOT]: ROOT, [PROMPTS]: PROMPTS },
        files: { [`${PROMPTS}/review-pr.md`]: "old" },
      },
    });

    await expect(importPrompt.execute(VALID)).resolves.toEqual({
      ok: true,
      mode: "update",
      name: "review-pr",
    });
    expect(
      readPromptFile((await fs.readFile(`${PROMPTS}/review-pr.md`)) ?? ""),
    ).toEqual({ description: VALID.description, text: VALID.text });
  });

  it("writes a name whose file is gone from the working Harness as an add", async () => {
    const { importPrompt } = build({
      seed: {
        directories: { [ROOT]: ROOT, [PROMPTS]: PROMPTS },
        files: { [`${PROMPTS}/other.md`]: "kept" },
      },
    });

    await expect(importPrompt.execute(VALID)).resolves.toMatchObject({
      ok: true,
      mode: "add",
    });
  });

  it.each([
    ["a text over 100 KB", { text: "x".repeat(5 * 1024 * 1024) }, "long-text"],
    [
      "a text under 100 KB in characters but over it in bytes",
      { text: "é".repeat(60_000) },
      "long-text",
    ],
    ["a name that climbs out", { name: "../x" }, "invalid-name"],
    ["an uppercase name", { name: "Review-PR" }, "invalid-name"],
    ["an empty name", { name: "" }, "empty-name"],
    ["an empty description", { description: "  " }, "empty-description"],
    [
      "a description holding a line break and ---",
      { description: "Review\n---\nmodel: opus" },
      "multiline-description",
    ],
    [
      "a description over 1024 characters",
      { description: "d".repeat(1025) },
      "long-description",
    ],
    ["an empty text", { text: "\n" }, "empty-text"],
  ])("refuses %s and writes nothing", async (_, change, error) => {
    const { importPrompt, fs } = build();

    await expect(
      importPrompt.execute({ ...VALID, ...change }),
    ).resolves.toEqual({ ok: false, error });
    expect(await fs.exists(PROMPTS)).toBe(false);
  });

  it("refuses without a connected Harness", async () => {
    const { importPrompt } = build({ root: undefined });

    await expect(importPrompt.execute(VALID)).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });

  it("refuses a prompts folder that resolves outside the Harness", async () => {
    const { importPrompt, fs } = build({
      seed: {
        directories: {
          [ROOT]: ROOT,
          "/harness/.maestro": "/elsewhere",
          [PROMPTS]: "/elsewhere/prompts",
        },
      },
    });

    await expect(importPrompt.execute(VALID)).resolves.toEqual({
      ok: false,
      error: "destination-unsafe",
    });
    expect(await fs.readFile(`${PROMPTS}/review-pr.md`)).toBeNull();
    expect(await fs.readFile("/elsewhere/prompts/review-pr.md")).toBeNull();
  });

  it("refuses a Harness it cannot read", async () => {
    const { importPrompt, fs } = build({ seed: {} });

    await expect(importPrompt.execute(VALID)).resolves.toEqual({
      ok: false,
      error: "destination-unreadable",
    });
    expect(await fs.readFile(`${PROMPTS}/review-pr.md`)).toBeNull();
  });

  it("refuses when the write fails", async () => {
    const { importPrompt, fs } = build({ writeFails: true });

    await expect(importPrompt.execute(VALID)).resolves.toEqual({
      ok: false,
      error: "write-failed",
    });
    expect(await fs.readFile(`${PROMPTS}/review-pr.md`)).toBeNull();
  });

  it("refuses while another Harness change holds the lock", async () => {
    const locks = new InFlightLocks();
    locks.run(ROOT, () => new Promise<void>(() => {}));
    const { importPrompt, fs } = build({ locks });

    await expect(importPrompt.execute(VALID)).resolves.toEqual({
      ok: false,
      error: "import-in-progress",
    });
    expect(await fs.exists(PROMPTS)).toBe(false);
  });
});
