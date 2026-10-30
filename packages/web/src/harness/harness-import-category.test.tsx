import type {
  CategoryList,
  HarnessState,
  ImportCheck,
  ImportPromptCheck,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery, sentence } from "../test-utils";
import { HarnessView } from "./harness-view";

// The Category field of Import skill and Import prompt, over a stubbed server
// that keeps its own category list.

afterEach(() => {
  vi.unstubAllGlobals();
});

type Assignment = CategoryList["assignments"][number];

const HARNESS: HarnessState = {
  origin: "github.com/fimoklei/agent-harness",
  releasedVersion: "v0.5.0",
  defaultBranch: "main",
  releaseState: "released",
  freshness: { outcome: "fetched", lastFetchedAt: "2026-08-03T11:56:00.000Z" },
  cloneSync: "current",
  localHeadCommit: "local-head",
  stages: {
    proposal: { outcome: "read", rows: [], bound: null },
    review: { outcome: "read", rows: [], bound: null },
    release: { outcome: "read", rows: [], bound: null },
  },
};

const SOURCE = "/home/me/Code Review";

const checkOf = (change: Partial<ImportCheck>): ImportCheck => ({
  mode: "add",
  name: "code-review",
  sourceBlocker: null,
  nameBlocker: null,
  advisories: [],
  category: null,
  ...change,
});

const listOf = (names: string[], assignments: Assignment[]): CategoryList => ({
  categories: names.map((name) => ({
    name,
    skills: assignments.filter(
      (each) => each.type === "skill" && each.category === name,
    ).length,
    prompts: assignments.filter(
      (each) => each.type === "prompt" && each.category === name,
    ).length,
  })),
  assignments,
});

function stubServer({
  names = ["Code review", "Docs"],
  assignments = [],
  check = checkOf({}),
  promptMode = "add",
  assign,
  added,
}: {
  /** Holds the add's answer back until it settles. */
  added?: Promise<"ok" | "refused">;
  names?: string[];
  assignments?: Assignment[];
  check?: ImportCheck;
  promptMode?: ImportPromptCheck["mode"];
  assign?: () => Response;
} = {}) {
  const state = { names: [...names], assignments: [...assignments] };
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      if (body !== undefined) posts.push({ url, body });
      switch (url) {
        case "/api/folder-chooser":
          return jsonResponse(
            init?.method === "POST" ? { path: SOURCE } : { available: true },
          );
        case "/api/harness/import/check":
          return jsonResponse(check);
        case "/api/harness/import":
          return jsonResponse({
            mode: check.mode,
            name: check.name,
            skipped: 0,
          });
        case "/api/harness/prompt/check":
          return jsonResponse({
            mode: promptMode,
            nameBlocker: null,
          } satisfies ImportPromptCheck);
        case "/api/harness/prompt/import":
          return jsonResponse({ mode: promptMode, name: "review-pr" });
        case "/api/categories/assign":
          if (assign) return assign();
          state.assignments = [
            ...state.assignments.filter(
              (each) =>
                !body.items.some(
                  (item: Assignment) =>
                    item.type === each.type && item.name === each.name,
                ),
            ),
            ...body.items.map((item: Assignment) => ({
              ...item,
              category: body.category,
            })),
          ];
          return jsonResponse(listOf(state.names, state.assignments));
        case "/api/categories":
          if (body === undefined) {
            return jsonResponse(listOf(state.names, state.assignments));
          }
          if ((await added) === "refused") {
            return jsonResponse({ error: "categories-unreadable" }, 500);
          }
          state.names = [...state.names, body.name].sort();
          return jsonResponse({
            ...listOf(state.names, state.assignments),
            added: body.name,
          });
        default:
          return jsonResponse(HARNESS);
      }
    }),
  );
  const writes = () =>
    posts.filter(({ url }) => url.startsWith("/api/categories"));
  return { posts, writes };
}

async function openImportSkill() {
  const user = userEvent.setup();
  renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
  await user.click(await screen.findByRole("button", { name: "Import" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Import skill" }),
  );
  const dialog = await screen.findByRole("dialog", { name: /a skill$/ });
  await user.click(within(dialog).getByRole("button", { name: "Browse" }));
  await waitFor(() =>
    expect(
      within(dialog).getByRole("textbox", { name: "Name in the Harness" }),
    ).toHaveValue("code-review"),
  );
  return { user, dialog: within(dialog) };
}

const PROMPT_FILE = (category: string) =>
  [
    "---",
    "description: Review the open pull request",
    "metadata:",
    `  category: ${category}`,
    "---",
    "Review $ARGUMENTS.",
  ].join("\n");

async function openImportPrompt(pasted: string) {
  const user = userEvent.setup();
  renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
  await user.click(await screen.findByRole("button", { name: "Import" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Import prompt" }),
  );
  const dialog = within(
    await screen.findByRole("dialog", { name: "Import a prompt" }),
  );
  await user.click(dialog.getByRole("textbox", { name: "Prompt text" }));
  await user.paste(pasted);
  await user.type(dialog.getByRole("textbox", { name: "Name" }), "review-pr");
  await user.tab();
  return { user, dialog };
}

// The field's button: named by its label, then the category it holds.
const categoryButton = (dialog: ReturnType<typeof within>, value: string) =>
  dialog.findByRole("button", { name: `Category ${value}` });

// Opens the field's menu and presses Add for a typed name.
async function addWhileOpen(
  user: ReturnType<typeof userEvent.setup>,
  dialog: ReturnType<typeof within>,
  name: string,
) {
  await user.click(await categoryButton(dialog, "No category"));
  await user.type(
    dialog.getByRole("combobox", { name: "Search categories" }),
    name,
  );
  await user.click(
    dialog.getByRole("option", { name: `Add category ${name}` }),
  );
}

const importSkill = (dialog: ReturnType<typeof within>) =>
  dialog.getByRole("button", { name: /^(Import|Update) skill$/ });

const dialogClosed = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

describe("Import skill's Category field", () => {
  it("opens on No category with the field's own hint, and assigns a picked category after the import", async () => {
    const { posts } = stubServer();
    const { user, dialog } = await openImportSkill();

    await user.click(await categoryButton(dialog, "No category"));
    expect(dialog.getByText("Only you see this category.")).toBeVisible();
    await user.click(await dialog.findByRole("option", { name: "Docs" }));
    await categoryButton(dialog, "Docs");
    await user.click(importSkill(dialog));

    await dialogClosed();
    await waitFor(() =>
      expect(posts.map(({ url }) => url)).toEqual([
        "/api/folder-chooser",
        "/api/harness/import/check",
        "/api/harness/import",
        "/api/categories/assign",
      ]),
    );
    expect(posts.at(-1)?.body).toEqual({
      items: [{ type: "skill", name: "code-review" }],
      category: "Docs",
    });
  });

  it("adds a typed category at once and assigns it after the import", async () => {
    const { writes } = stubServer();
    const { user, dialog } = await openImportSkill();

    await user.click(await categoryButton(dialog, "No category"));
    await user.type(
      dialog.getByRole("combobox", { name: "Search categories" }),
      "Planning",
    );
    await user.click(
      dialog.getByRole("option", { name: "Add category Planning" }),
    );
    await categoryButton(dialog, "Planning");
    expect(writes()).toEqual([
      { url: "/api/categories", body: { name: "Planning" } },
    ]);
    await user.click(importSkill(dialog));

    await waitFor(() =>
      expect(writes().at(-1)).toEqual({
        url: "/api/categories/assign",
        body: {
          items: [{ type: "skill", name: "code-review" }],
          category: "Planning",
        },
      }),
    );
  });

  it("waits for an add still running when Import is pressed, then assigns the added category", async () => {
    let settle: (outcome: "ok") => void = () => {};
    const { posts } = stubServer({
      added: new Promise((resolve) => {
        settle = resolve;
      }),
    });
    const { user, dialog } = await openImportSkill();

    await addWhileOpen(user, dialog, "Planning");
    // The press closes the menu while the add is still on its way.
    await user.click(importSkill(dialog));
    expect(posts.map(({ url }) => url)).not.toContain("/api/harness/import");
    settle("ok");

    await dialogClosed();
    await waitFor(() =>
      expect(posts.at(-1)).toEqual({
        url: "/api/categories/assign",
        body: {
          items: [{ type: "skill", name: "code-review" }],
          category: "Planning",
        },
      }),
    );
  });

  it("imports nothing when an add still running at Import is refused, and says so under the field", async () => {
    let settle: (outcome: "refused") => void = () => {};
    const { posts } = stubServer({
      added: new Promise((resolve) => {
        settle = resolve;
      }),
    });
    const { user, dialog } = await openImportSkill();

    await addWhileOpen(user, dialog, "Planning");
    await user.click(importSkill(dialog));
    settle("refused");

    expect(await dialog.findByText("Category not added")).toBeVisible();
    await categoryButton(dialog, "No category");
    expect(posts.map(({ url }) => url)).not.toContain("/api/harness/import");
  });

  it("preselects the category SKILL.md names, ignoring case, and says where it came from", async () => {
    const { writes } = stubServer({
      check: checkOf({ category: "code REVIEW" }),
    });
    const { user, dialog } = await openImportSkill();

    await categoryButton(dialog, "Code review");
    expect(dialog.getByText("Taken from SKILL.md.")).toBeVisible();
    await user.click(importSkill(dialog));

    await waitFor(() =>
      expect(writes()).toEqual([
        {
          url: "/api/categories/assign",
          body: {
            items: [{ type: "skill", name: "code-review" }],
            category: "Code review",
          },
        },
      ]),
    );
  });

  it("offers a category SKILL.md names that matches none, and adds nothing until it is picked", async () => {
    const { posts, writes } = stubServer({
      check: checkOf({ category: "Planning" }),
    });
    const { user, dialog } = await openImportSkill();

    await user.click(await categoryButton(dialog, "No category"));
    expect(dialog.getByText("Only you see this category.")).toBeVisible();
    expect(
      dialog.getByRole("option", { name: "Add category Planning" }),
    ).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(importSkill(dialog));

    await dialogClosed();
    await waitFor(() =>
      expect(posts.map(({ url }) => url)).toContain("/api/harness/import"),
    );
    expect(writes()).toEqual([]);
  });

  it("shows an updated skill's own category, ignores SKILL.md's, and keeps it", async () => {
    const { writes } = stubServer({
      check: checkOf({ mode: "update", category: "Docs" }),
      assignments: [
        { type: "skill", name: "code-review", category: "Code review" },
      ],
    });
    const { user, dialog } = await openImportSkill();

    await categoryButton(dialog, "Code review");
    expect(dialog.queryByText("Taken from SKILL.md.")).not.toBeInTheDocument();
    await user.click(importSkill(dialog));

    await dialogClosed();
    expect(writes()).toEqual([]);
  });

  it("keeps the import when the category is not set, and says so above the table", async () => {
    const { posts } = stubServer({
      assign: () => jsonResponse({ error: "categories-unreadable" }, 500),
    });
    const { user, dialog } = await openImportSkill();

    await user.click(await categoryButton(dialog, "No category"));
    await user.click(await dialog.findByRole("option", { name: "Docs" }));
    await user.click(importSkill(dialog));

    await dialogClosed();
    expect(await screen.findByText("Category not set")).toBeVisible();
    expect(
      screen.getByText(
        sentence(
          "code-review was imported. Select Set category on Skills to set its category.",
        ),
      ),
    ).toBeVisible();
    // The import stood: nothing undoes it after the assign failed.
    expect(posts.map(({ url }) => url)).toEqual([
      "/api/folder-chooser",
      "/api/harness/import/check",
      "/api/harness/import",
      "/api/categories/assign",
    ]);

    await user.click(
      screen.getByRole("button", { name: "Close Category not set" }),
    );
    expect(screen.queryByText("Category not set")).not.toBeInTheDocument();
  });
});

describe("Import prompt's Category field", () => {
  it("preselects the category the front matter names, and assigns it after the import", async () => {
    const { writes } = stubServer();
    const { user, dialog } = await openImportPrompt(PROMPT_FILE("docs"));

    await categoryButton(dialog, "Docs");
    expect(dialog.getByText("Taken from the front matter.")).toBeVisible();
    await user.click(dialog.getByRole("button", { name: "Import prompt" }));

    await waitFor(() =>
      expect(writes()).toEqual([
        {
          url: "/api/categories/assign",
          body: {
            items: [{ type: "prompt", name: "review-pr" }],
            category: "Docs",
          },
        },
      ]),
    );
  });

  it("assigns a picked category", async () => {
    const { writes } = stubServer();
    const { user, dialog } = await openImportPrompt("Review $ARGUMENTS.");
    await user.type(
      dialog.getByRole("textbox", { name: "Description" }),
      "Review it",
    );

    await user.click(await categoryButton(dialog, "No category"));
    await user.click(await dialog.findByRole("option", { name: "Docs" }));
    await user.click(dialog.getByRole("button", { name: "Import prompt" }));

    await waitFor(() =>
      expect(writes().at(-1)?.body).toEqual({
        items: [{ type: "prompt", name: "review-pr" }],
        category: "Docs",
      }),
    );
  });

  it("waits for an add still running when Import prompt is pressed, then assigns the added category", async () => {
    let settle: (outcome: "ok") => void = () => {};
    const { writes } = stubServer({
      added: new Promise((resolve) => {
        settle = resolve;
      }),
    });
    const { user, dialog } = await openImportPrompt("Review $ARGUMENTS.");
    await user.type(
      dialog.getByRole("textbox", { name: "Description" }),
      "Review it",
    );

    await addWhileOpen(user, dialog, "Planning");
    await user.click(dialog.getByRole("button", { name: "Import prompt" }));
    settle("ok");

    await waitFor(() =>
      expect(writes().at(-1)?.body).toEqual({
        items: [{ type: "prompt", name: "review-pr" }],
        category: "Planning",
      }),
    );
  });

  it("shows an updated prompt's own category and ignores the front matter's", async () => {
    const { writes } = stubServer({
      promptMode: "update",
      assignments: [{ type: "prompt", name: "review-pr", category: "Docs" }],
    });
    const { user, dialog } = await openImportPrompt(PROMPT_FILE("Code review"));

    await categoryButton(dialog, "Docs");
    expect(
      dialog.queryByText("Taken from the front matter."),
    ).not.toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Update prompt" }));

    await dialogClosed();
    expect(writes()).toEqual([]);
  });

  it("says on Prompts' terms when the category is not set", async () => {
    stubServer({
      assign: () => jsonResponse({ error: "item-not-found" }, 404),
    });
    const { user, dialog } = await openImportPrompt(PROMPT_FILE("Docs"));

    await categoryButton(dialog, "Docs");
    await user.click(dialog.getByRole("button", { name: "Import prompt" }));

    await dialogClosed();
    expect(
      await screen.findByText(
        sentence(
          "review-pr was imported. Select Set category on Prompts to set its category.",
        ),
      ),
    ).toBeVisible();
  });
});
