// Copying the Harness categories into the operator's own list, over HTTP: the
// composition over an in-memory disk and Harness.
import type { CategoryList, CopyPreview } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryApp } from "../helpers/in-memory-app";

const HARNESS = "/harness";
const FILE = ".maestro/categories.yml";

// Review and Planning; `tdd` and `notes` in Planning, `gone` in Review though
// the Harness holds no `gone`.
const HARNESS_FILE = [
  "version: 1",
  "categories: [Review, Planning]",
  "assignments:",
  "  - { type: skill, name: tdd, category: Planning }",
  "  - { type: prompt, name: notes, category: Planning }",
  "  - { type: skill, name: gone, category: Review }",
  "",
].join("\n");

const post = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const world = (file: string | null = HARNESS_FILE) => {
  const env: NodeJS.ProcessEnv = {
    HOME: "/home",
    MAESTRO_HOME: "/maestro-home",
    MAESTRO_INVENTORY_PATH: HARNESS,
  };
  const fs = new InMemoryFileSystem({ directories: { [HARNESS]: HARNESS } });
  const harness = new InMemoryHarnessGit();
  const app = inMemoryApp({ env, fs, git: { harness } });
  const release = (tag: string, text: string | null) => {
    harness.commit(
      tag,
      { tdd: "# tdd\n", idea: "# idea\n" },
      {
        prompts: { notes: "# notes\n" },
        files: text === null ? {} : { [FILE]: text },
      },
    );
    harness.tags = [...(harness.tags ?? []), { name: tag, commit: tag }];
  };
  release("v1.5.0", file);
  const own = async (
    names: string[],
    assignments: { type: "skill" | "prompt"; name: string; category: string }[],
  ) => {
    for (const name of names) {
      expect(
        (await app.request("/api/categories", post({ name }))).status,
      ).toBe(200);
    }
    for (const { type, name, category } of assignments) {
      const res = await app.request(
        "/api/categories/assign",
        post({ items: [{ type, name }], category }),
      );
      expect(res.status).toBe(200);
    }
  };
  const preview = async () => {
    const res = await app.request("/api/categories/harness/preview", post({}));
    return { status: res.status, body: await res.json() };
  };
  const copy = async (mode: unknown) => {
    const res = await app.request(
      "/api/categories/harness/copy",
      post({ mode }),
    );
    return { status: res.status, body: await res.json() };
  };
  const list = async () =>
    (await (await app.request("/api/categories")).json()) as CategoryList;
  return { app, harness, release, own, preview, copy, list };
};

describe("copying the Harness categories over HTTP", () => {
  it("previews a copy into an empty list without the choice, counting the valid categories", async () => {
    const { preview } = world();

    expect(await preview()).toEqual({
      status: 200,
      body: {
        tag: "v1.5.0",
        count: 2,
        skipped: 0,
        choice: false,
        modes: {
          add: { added: ["Planning", "Review"], deleted: [], unchanged: [] },
          replace: {
            added: ["Planning", "Review"],
            deleted: [],
            unchanged: [],
          },
        },
        fresh: [],
      } satisfies CopyPreview,
    });
  });

  it("offers the choice to an operator with categories of their own", async () => {
    const { own, preview } = world();
    await own(["Drafts", "review"], []);

    expect((await preview()).body).toMatchObject({
      choice: true,
      modes: {
        add: {
          added: ["Planning"],
          deleted: [],
          unchanged: ["Drafts", "review"],
        },
        replace: {
          added: ["Planning"],
          deleted: ["Drafts"],
          unchanged: ["Review"],
        },
      },
    } satisfies Partial<CopyPreview>);
  });

  it("counts the entries the file skipped for an error", async () => {
    const { preview } = world(
      [
        "version: 1",
        "categories: [Planning, planning]",
        "assignments:",
        "  - { type: skill, name: tdd, category: Nowhere }",
        "",
      ].join("\n"),
    );

    expect((await preview()).body).toMatchObject({ count: 1, skipped: 2 });
  });

  it("copies into an empty list, skipping an item Inventory lacks", async () => {
    const { copy, list } = world();

    const copied = await copy("add");

    const expected = {
      categories: [
        { name: "Planning", skills: 1, prompts: 1 },
        { name: "Review", skills: 0, prompts: 0 },
      ],
      assignments: [
        { type: "skill", name: "tdd", category: "Planning" },
        { type: "prompt", name: "notes", category: "Planning" },
      ],
    } satisfies CategoryList;
    expect(copied).toEqual({ status: 200, body: expected });
    expect(await list()).toEqual(expected);
  });

  it("adds with Add, changing no assignment the operator made and keeping their spelling", async () => {
    const { own, copy } = world();
    await own(
      ["review", "Drafts"],
      [{ type: "skill", name: "tdd", category: "Drafts" }],
    );

    expect((await copy("add")).body).toEqual({
      categories: [
        { name: "Drafts", skills: 1, prompts: 0 },
        { name: "Planning", skills: 0, prompts: 1 },
        { name: "review", skills: 0, prompts: 0 },
      ],
      assignments: [
        { type: "skill", name: "tdd", category: "Drafts" },
        { type: "prompt", name: "notes", category: "Planning" },
      ],
    } satisfies CategoryList);
  });

  it("recomputes on confirm from the released file as it stands then", async () => {
    const { release, preview, copy } = world();
    await preview();
    release("v1.6.0", "version: 1\ncategories: [Writing]\nassignments: []\n");

    expect((await copy("add")).body).toEqual({
      categories: [{ name: "Writing", skills: 0, prompts: 0 }],
      assignments: [],
    } satisfies CategoryList);
  });

  it.each([
    ["no file", null],
    ["a file with an error", "categories: [\n"],
  ])(
    "refuses the preview and the copy for a release with %s",
    async (_, text) => {
      const { preview, copy, list } = world(text);

      expect(await preview()).toEqual({
        status: 409,
        body: { error: "no-harness-categories" },
      });
      expect(await copy("add")).toEqual({
        status: 409,
        body: { error: "no-harness-categories" },
      });
      expect((await list()).categories).toEqual([]);
    },
  );

  it("refuses the copy when the Harness release could not be read", async () => {
    const { harness, copy } = world();
    harness.tags = null;

    expect(await copy("add")).toEqual({
      status: 503,
      body: { error: "harness-categories-unread" },
    });
  });

  it("refuses a mode it does not know", async () => {
    const { copy } = world();

    expect((await copy("merge")).status).toBe(400);
  });
});
