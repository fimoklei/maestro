import type {
  CategoryList,
  HarnessState,
  ImportPromptCheck,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery, sentence } from "../test-utils";
import { HarnessView } from "./harness-view";

// The Category field of Import prompt, over a stubbed server
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
  promptMode = "add",
  assign,
  added,
  harness = HARNESS,
}: {
  harness?: HarnessState;
  /** Holds the add's answer back until it settles. */
  added?: Promise<"ok" | "refused">;
  names?: string[];
  assignments?: Assignment[];
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
          return jsonResponse(harness);
      }
    }),
  );
  const writes = () =>
    posts.filter(({ url }) => url.startsWith("/api/categories"));
  return { posts, writes };
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

const dialogClosed = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

describe("Import prompt's Category field", () => {
  it("sits between Description and the prompt text", async () => {
    stubServer();
    const { dialog } = await openImportPrompt("Review $ARGUMENTS.");

    const follows = (a: Element, b: Element) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    const category = await categoryButton(dialog, "No category");
    expect(
      follows(dialog.getByRole("textbox", { name: "Description" }), category),
    ).toBe(true);
    expect(
      follows(category, dialog.getByRole("textbox", { name: "Prompt text" })),
    ).toBe(true);
  });

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

    expect(
      await dialog.findByText(
        sentence(
          "review-pr was imported. Select Close, then select Set category on Prompts.",
        ),
      ),
    ).toBeVisible();
  });
});
