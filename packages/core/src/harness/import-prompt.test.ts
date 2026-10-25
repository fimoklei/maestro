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
      isFileEntry: (path) => fs.isFileEntry(path),
      isDirectoryEntry: (path) => fs.isDirectoryEntry(path),
      readFile: (path) => fs.readFile(path),
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
  frontmatter: "",
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

  it("keeps the pasted front matter keys, order and comments, with the dialog's description", async () => {
    const { importPrompt, fs } = build();
    const draft = draftPrompt(
      "---\nmodel: haiku\ndescription: Old words\n# Shown in the menu.\nargument-hint: '[scope]'\n---\nCommit $1.\n",
      null,
    );

    await importPrompt.execute({
      ...draft,
      name: "commit",
      description: "Write a commit message",
    });

    expect(await fs.readFile(`${PROMPTS}/commit.md`)).toBe(
      "---\nmodel: haiku\ndescription: Write a commit message\n# Shown in the menu.\nargument-hint: '[scope]'\n---\nCommit $1.\n",
    );
  });

  it("replaces the whole file on an update, dropping keys the paste lacks", async () => {
    const { importPrompt, fs } = build({
      seed: {
        directories: { [ROOT]: ROOT, [PROMPTS]: PROMPTS },
        files: {
          [`${PROMPTS}/review-pr.md`]:
            "---\ndescription: Old\nargument-hint: '[pr]'\nmodel: opus\n---\nOld text.\n",
        },
      },
    });
    const draft = draftPrompt(
      "---\ndescription: Review a pull request.\nmodel: haiku\n---\nReview $ARGUMENTS.\n",
      null,
    );

    await expect(
      importPrompt.execute({ ...draft, name: "review-pr" }),
    ).resolves.toMatchObject({ ok: true, mode: "update" });
    expect(await fs.readFile(`${PROMPTS}/review-pr.md`)).toBe(
      "---\ndescription: Review a pull request.\nmodel: haiku\n---\nReview $ARGUMENTS.\n",
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

  it("refuses a taken name whose prompt file is a link", async () => {
    const { importPrompt, fs } = build({
      seed: {
        directories: { [ROOT]: ROOT, [PROMPTS]: PROMPTS },
        files: { [`${PROMPTS}/other.md`]: "other" },
        fileSymlinks: { [`${PROMPTS}/review-pr.md`]: `${PROMPTS}/other.md` },
      },
    });

    await expect(importPrompt.execute(VALID)).resolves.toEqual({
      ok: false,
      error: "destination-unsafe",
    });
    expect(await fs.isFileEntry(`${PROMPTS}/review-pr.md`)).toBe(false);
    expect(await fs.readFile(`${PROMPTS}/other.md`)).toBe("other");
  });

  it("creates no prompts folder behind a .maestro link that leaves the Harness", async () => {
    const { importPrompt, fs } = build({
      seed: {
        directories: { [ROOT]: ROOT, "/harness/.maestro": "/elsewhere" },
      },
    });

    await expect(importPrompt.execute(VALID)).resolves.toEqual({
      ok: false,
      error: "destination-unsafe",
    });
    expect(await fs.exists(PROMPTS)).toBe(false);
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

describe("ImportPrompt.check", () => {
  const TAKEN = {
    directories: { [ROOT]: ROOT, [PROMPTS]: PROMPTS },
    files: { [`${PROMPTS}/review-pr.md`]: "old" },
  };

  it("reports a name whose file is in the prompts folder as taken", async () => {
    const { importPrompt } = build({ seed: TAKEN });

    await expect(importPrompt.check("review-pr")).resolves.toEqual({
      ok: true,
      check: { mode: "update", nameBlocker: null },
    });
  });

  it("reports a name whose file is gone from the working Harness as free", async () => {
    const { importPrompt } = build({
      seed: {
        directories: { [ROOT]: ROOT, [PROMPTS]: PROMPTS },
        files: { [`${PROMPTS}/other.md`]: "kept" },
      },
    });

    await expect(importPrompt.check("review-pr")).resolves.toEqual({
      ok: true,
      check: { mode: "add", nameBlocker: null },
    });
  });

  it("reports a name as free before the prompts folder exists, creating nothing", async () => {
    const { importPrompt, fs } = build();

    await expect(importPrompt.check("review-pr")).resolves.toEqual({
      ok: true,
      check: { mode: "add", nameBlocker: null },
    });
    expect(await fs.exists(PROMPTS)).toBe(false);
  });

  it.each([
    ["../review-pr", "invalid-name"],
    ["Review-PR", "invalid-name"],
    ["", "empty-name"],
  ])("reports %j as a name blocker", async (name, nameBlocker) => {
    const { importPrompt } = build({ seed: TAKEN });

    await expect(importPrompt.check(name)).resolves.toEqual({
      ok: true,
      check: { mode: "add", nameBlocker },
    });
  });

  it("refuses without a connected Harness", async () => {
    const { importPrompt } = build({ root: undefined });

    await expect(importPrompt.check("review-pr")).resolves.toEqual({
      ok: false,
      error: "not-configured",
    });
  });
});

const IN_HARNESS = (raw: string) => ({
  directories: { [ROOT]: ROOT, [PROMPTS]: PROMPTS },
  files: { [`${PROMPTS}/review-pr.md`]: raw },
});

describe("ImportPrompt.read", () => {
  it("returns the working file's description and prompt text, placeholders kept", async () => {
    const { importPrompt } = build({
      seed: IN_HARNESS(
        "---\ndescription: Review a pull request\nargument-hint: '[pr]'\n---\nReview [PR LINK] for $ARGUMENTS.\nStart at $1.\n",
      ),
    });

    await expect(importPrompt.read("review-pr")).resolves.toEqual({
      ok: true,
      prompt: {
        description: "Review a pull request",
        text: "Review [PR LINK] for $ARGUMENTS.\nStart at $1.\n",
      },
    });
  });

  it.each([
    ["no front matter", "Review $ARGUMENTS.\n"],
    ["an unclosed block", "---\ndescription: Review\nReview $ARGUMENTS.\n"],
    [
      "a closed block that does not parse",
      "---\ndescription: [unclosed\n---\nReview $ARGUMENTS.\n",
    ],
    ["a closed block that is a list", "---\n- review\n---\nReview it.\n"],
  ])(
    "reads a file with %s as an empty description and the whole file",
    async (_, raw) => {
      const { importPrompt } = build({ seed: IN_HARNESS(raw) });

      await expect(importPrompt.read("review-pr")).resolves.toEqual({
        ok: true,
        prompt: { description: "", text: raw },
      });
    },
  );

  it("reads a folded description as one line", async () => {
    const { importPrompt } = build({
      seed: IN_HARNESS(
        "---\ndescription: >\n  Review the pull request\n  in plain words\n---\nReview it.\n",
      ),
    });

    await expect(importPrompt.read("review-pr")).resolves.toMatchObject({
      prompt: { description: "Review the pull request in plain words" },
    });
  });
});

describe("ImportPrompt.edit", () => {
  const RAW =
    "---\ndescription: Review a pull request\n---\nReview $ARGUMENTS.\n";
  const READ = {
    description: "Review a pull request",
    text: "Review $ARGUMENTS.\n",
  };

  it("writes the new description and prompt text, which read back equal", async () => {
    const { importPrompt } = build({ seed: IN_HARNESS(RAW) });
    const edited = {
      description: "Review a pull request in full",
      text: "Review [PR LINK].\nList the risks of $1.\n",
    };

    await expect(
      importPrompt.edit({ name: "review-pr", ...edited, read: READ }),
    ).resolves.toEqual({ ok: true, name: "review-pr" });
    await expect(importPrompt.read("review-pr")).resolves.toEqual({
      ok: true,
      prompt: edited,
    });
  });

  it("keeps the other front matter keys, their order and comments", async () => {
    const { importPrompt, fs } = build({
      seed: IN_HARNESS(
        "---\nmodel: haiku\n# Shown in the menu.\ndescription: Old words\nargument-hint: '[pr]'\n---\nOld text.\n",
      ),
    });

    await importPrompt.edit({
      name: "review-pr",
      description: "Review a pull request",
      text: "Review $1.\n",
      read: { description: "Old words", text: "Old text.\n" },
    });

    expect(await fs.readFile(`${PROMPTS}/review-pr.md`)).toBe(
      "---\nmodel: haiku\n# Shown in the menu.\ndescription: Review a pull request\nargument-hint: '[pr]'\n---\nReview $1.\n",
    );
  });

  it("writes a CRLF file back with LF line endings", async () => {
    const { importPrompt, fs } = build({
      seed: IN_HARNESS(
        "---\r\ndescription: Old words\r\nargument-hint: '[pr]'\r\n---\r\nOld text.\r\n",
      ),
    });

    await importPrompt.edit({
      name: "review-pr",
      description: "Old words",
      text: "New text.\n",
      read: { description: "Old words", text: "Old text.\r\n" },
    });

    expect(await fs.readFile(`${PROMPTS}/review-pr.md`)).toBe(
      "---\ndescription: Old words\nargument-hint: '[pr]'\n---\nNew text.\n",
    );
  });

  it("gives a file without readable front matter a block holding only the description", async () => {
    const raw = "---\ndescription: [unclosed\n---\nOld text.\n";
    const { importPrompt, fs } = build({ seed: IN_HARNESS(raw) });

    await importPrompt.edit({
      name: "review-pr",
      description: "Review a pull request",
      text: "Review $1.\n",
      read: { description: "", text: raw },
    });

    expect(await fs.readFile(`${PROMPTS}/review-pr.md`)).toBe(
      "---\ndescription: Review a pull request\n---\nReview $1.\n",
    );
  });

  it("judges the fields again and writes nothing when one breaks a rule", async () => {
    const { importPrompt, fs } = build({ seed: IN_HARNESS(RAW) });

    await expect(
      importPrompt.edit({
        name: "review-pr",
        description: "Review\nmodel: opus",
        text: "Review $ARGUMENTS.\n",
        read: READ,
      }),
    ).resolves.toEqual({ ok: false, error: "multiline-description" });
    expect(await fs.readFile(`${PROMPTS}/review-pr.md`)).toBe(RAW);
  });
});
