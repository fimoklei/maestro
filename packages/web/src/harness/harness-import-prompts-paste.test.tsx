import type {
  CategoryList,
  ImportPromptCheck,
  ImportPromptsAnswer,
  PromptImportDraft,
} from "@maestro/core";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { RELEASED } from "./harness-flow-fixture";
import { HarnessView } from "./harness-view";

// Paste text in Import prompts, over a server that keeps its own category list
// and lands every prompt it is sent.

type Assignment = CategoryList["assignments"][number];

const listOf = (names: string[], assignments: Assignment[]): CategoryList => ({
  categories: names.map((name) => ({
    name,
    skills: 0,
    prompts: assignments.filter((each) => each.category === name).length,
  })),
  assignments,
});

function stubServer({
  taken = [],
  names = ["Code review", "Docs"],
  assignments = [],
}: {
  taken?: string[];
  names?: string[];
  assignments?: Assignment[];
} = {}) {
  const imports: PromptImportDraft[][] = [];
  const assigned: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body =
        init?.method === "POST" ? JSON.parse(String(init.body)) : null;
      if (url === "/api/harness/prompt/check") {
        return jsonResponse({
          mode: taken.includes(body.name) ? "update" : "add",
          nameBlocker: null,
        } satisfies ImportPromptCheck);
      }
      if (url === "/api/harness/prompts/import") {
        const prompts = body.prompts as PromptImportDraft[];
        imports.push(prompts);
        return jsonResponse({
          outcomes: prompts.map(({ name, replace }) => ({
            name,
            imported: true,
            mode: replace ? "update" : "add",
          })),
        } satisfies ImportPromptsAnswer);
      }
      if (url === "/api/categories/assign") {
        assigned.push(body);
        return jsonResponse(listOf(names, assignments));
      }
      if (url === "/api/categories") {
        return jsonResponse(listOf(names, assignments));
      }
      return jsonResponse(RELEASED);
    }),
  );
  return { imports, assigned };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const PASTED = [
  "---",
  "description: Review the open pull request",
  "model: opus",
  "---",
  "Review $ARGUMENTS.",
  "Use $1 as the focus.",
  "",
].join("\n");

async function openPasteText(user: ReturnType<typeof userEvent.setup>) {
  renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
  await user.click(await screen.findByRole("button", { name: "Import" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Import prompts" }),
  );
  return screen.findByRole("dialog", { name: "Import prompts" });
}

const sourceOf = (dialog: HTMLElement, name: "Paste text" | "Choose files") =>
  within(
    within(dialog).getByRole("group", { name: "Prompt source" }),
  ).getByRole("button", { name });

const field = (dialog: HTMLElement, name: string) =>
  within(dialog).getByRole("textbox", { name });

const importOne = (dialog: HTMLElement) =>
  within(dialog).getByRole("button", { name: "Import prompt" });

async function fillPrompt(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  name: string,
) {
  await user.type(field(dialog, "Name"), name);
  await user.type(field(dialog, "Description"), "Review it");
  await user.type(field(dialog, "Prompt text"), "Go.");
}

describe("Import prompts — Paste text", () => {
  it("imports pasted text as one prompt, moving its description out of the text, and shows the Report", async () => {
    const { imports } = stubServer();
    const user = userEvent.setup();
    const dialog = await openPasteText(user);
    expect(sourceOf(dialog, "Paste text")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const text = field(dialog, "Prompt text");
    for (const name of ["Name", "Description"]) {
      expect(field(dialog, name)).not.toHaveAccessibleDescription();
    }
    expect(text).not.toHaveAccessibleDescription();

    await user.click(text);
    await user.paste(PASTED);
    expect(field(dialog, "Description")).toHaveValue(
      "Review the open pull request",
    );
    expect(text).toHaveValue("Review $ARGUMENTS.\nUse $1 as the focus.\n");
    // No name is guessed from pasted text.
    expect(field(dialog, "Name")).toHaveValue("");

    await user.type(field(dialog, "Name"), "review-pr");
    await user.type(text, "Be brief.");
    await user.click(importOne(dialog));

    await within(dialog).findByRole("heading", {
      name: "Imported 1 of 1 prompt",
    });
    expect(imports).toEqual([
      [
        {
          name: "review-pr",
          frontmatter: "description: Review the open pull request\nmodel: opus",
          description: "Review the open pull request",
          text: "Review $ARGUMENTS.\nUse $1 as the focus.\nBe brief.",
          example: "",
          replace: false,
        },
      ],
    ]);
    const imported = within(dialog).getByRole("region", {
      name: "Imported · 1",
    });
    expect(within(imported).getByText("review-pr")).toBeVisible();
  });

  it("drops the pasted front matter once the whole text is replaced", async () => {
    const { imports } = stubServer();
    const user = userEvent.setup();
    const dialog = await openPasteText(user);
    const text = field(dialog, "Prompt text");
    await user.click(text);
    await user.paste(PASTED);
    await user.clear(text);
    await user.type(text, "Read the diff.");

    await user.type(field(dialog, "Name"), "review-pr");
    await user.click(importOne(dialog));

    await waitFor(() =>
      expect(imports).toEqual([
        [
          {
            name: "review-pr",
            frontmatter: "",
            description: "Review the open pull request",
            text: "Read the diff.",
            example: "",
            replace: false,
          },
        ],
      ]),
    );
  });

  it("runs the fields Name, Description, Category, then the text, and saves the picked category after the import", async () => {
    const { assigned } = stubServer();
    const user = userEvent.setup();
    const dialog = await openPasteText(user);

    const category = await within(dialog).findByRole("button", {
      name: "Category No category",
    });
    expect(category).not.toHaveAccessibleDescription();
    const order = [
      field(dialog, "Name"),
      field(dialog, "Description"),
      category,
      field(dialog, "Prompt text"),
    ];
    for (const [index, element] of order.slice(1).entries()) {
      expect(
        // biome-ignore lint/style/noNonNullAssertion: the slice is one shorter.
        order[index]!.compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).not.toBe(0);
    }

    await user.click(category);
    // The menu floats outside the dialog.
    await user.click(await screen.findByRole("option", { name: "Docs" }));
    await fillPrompt(user, dialog, "review-pr");
    await user.click(importOne(dialog));

    await within(dialog).findByRole("heading", {
      name: "Imported 1 of 1 prompt",
    });
    expect(assigned).toEqual([
      { items: [{ type: "prompt", name: "review-pr" }], category: "Docs" },
    ]);
  });

  it("starts the Category on the one the pasted front matter names", async () => {
    const { assigned } = stubServer();
    const user = userEvent.setup();
    const dialog = await openPasteText(user);
    await user.click(field(dialog, "Prompt text"));
    await user.paste(
      "---\ndescription: Review it\nmetadata:\n  category: docs\n---\nGo.\n",
    );

    expect(
      await within(dialog).findByRole("button", { name: "Category Docs" }),
    ).not.toHaveAccessibleDescription();
    await user.type(field(dialog, "Name"), "review-pr");
    await user.click(importOne(dialog));

    await within(dialog).findByRole("heading", {
      name: "Imported 1 of 1 prompt",
    });
    expect(assigned).toEqual([
      { items: [{ type: "prompt", name: "review-pr" }], category: "Docs" },
    ]);
  });

  it("lists a pasted name the Harness holds under Already in the Harness, unchecked, and replaces it once checked", async () => {
    const { imports, assigned } = stubServer({
      taken: ["review-pr"],
      assignments: [{ type: "prompt", name: "review-pr", category: "Docs" }],
    });
    const user = userEvent.setup();
    const dialog = await openPasteText(user);
    await fillPrompt(user, dialog, "review-pr");

    const held = await within(dialog).findByRole("group", {
      name: /^⚠ Already in the Harness · 1$/,
    });
    const box = within(held).getByRole("checkbox", { name: "review-pr" });
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription("Replaces the one in the Harness");
    // The Category field sets the row; the row has no menu of its own.
    expect(
      within(held).queryByRole("button", { name: /^Set category for/ }),
    ).toBeNull();
    expect(
      await within(dialog).findByRole("button", { name: "Category Docs" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Import prompts" }),
    ).toHaveAttribute("aria-disabled", "true");

    await user.click(box);
    await user.click(importOne(dialog));

    await within(dialog).findByRole("heading", {
      name: "Imported 1 of 1 prompt",
    });
    expect(imports.map((prompts) => prompts.map((p) => p.replace))).toEqual([
      [true],
    ]);
    expect(
      within(
        within(dialog).getByRole("region", { name: "Imported · 1" }),
      ).getByText("Changed"),
    ).toBeVisible();
    expect(assigned).toEqual([]);
  });

  it("clears the list when the source switches", async () => {
    stubServer();
    const user = userEvent.setup();
    const dialog = await openPasteText(user);
    await fillPrompt(user, dialog, "review-pr");

    await user.click(sourceOf(dialog, "Choose files"));
    const input = dialog.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
    await user.upload(
      input,
      new File(["---\ndescription: Notes\n---\nGo.\n"], "release-notes.md"),
    );
    expect(
      await within(dialog).findByRole("checkbox", { name: "release-notes" }),
    ).toBeChecked();

    await user.click(sourceOf(dialog, "Paste text"));
    expect(field(dialog, "Name")).toHaveValue("");
    expect(field(dialog, "Prompt text")).toHaveValue("");

    await user.click(sourceOf(dialog, "Choose files"));
    expect(within(dialog).queryAllByRole("checkbox")).toEqual([]);
  });

  it("shows field errors only after an empty submit, selecting Prompt text, without a request", async () => {
    const { imports } = stubServer();
    const user = userEvent.setup();
    const dialog = await openPasteText(user);
    await user.click(
      within(
        within(dialog).getByRole("group", { name: "Prompt text or example" }),
      ).getByRole("button", { name: "Example" }),
    );
    const name = field(dialog, "Name");
    expect(name).toBeValid();

    await user.click(importOne(dialog));

    expect(name).toBeInvalid();
    expect(name).toHaveAccessibleDescription(/Enter a name\./);
    expect(field(dialog, "Description")).toHaveAccessibleDescription(
      /Enter a description\./,
    );
    expect(field(dialog, "Prompt text")).toHaveAccessibleDescription(
      /Enter the prompt text\./,
    );
    expect(imports).toEqual([]);

    await user.type(name, "Review");
    expect(name).toHaveAccessibleDescription(
      /A prompt name uses lowercase letters, digits and single hyphens, like pr-review\./,
    );
    await user.clear(name);
    await user.type(name, "review-pr");
    expect(name).toBeValid();
  });

  it("refuses a text over 100 KB without a request", async () => {
    const { imports } = stubServer();
    const user = userEvent.setup();
    const dialog = await openPasteText(user);
    await user.type(field(dialog, "Name"), "review-pr");
    await user.type(field(dialog, "Description"), "Review");
    await user.click(field(dialog, "Prompt text"));
    await user.paste("é".repeat(60_000));

    await user.click(importOne(dialog));

    expect(
      await within(dialog).findByText("Prompt over 100 KB"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Shorten the text to 100 KB or less. Then select Import prompt.",
      ),
    ).toBeInTheDocument();
    expect(imports).toEqual([]);
  });

  it("drops the over-100 KB notice once the held pasted row is unchecked", async () => {
    stubServer({ taken: ["review-pr"] });
    const user = userEvent.setup();
    const dialog = await openPasteText(user);
    await user.type(field(dialog, "Name"), "review-pr");
    await user.type(field(dialog, "Description"), "Review");
    await user.click(field(dialog, "Prompt text"));
    await user.paste("é".repeat(60_000));
    const box = await within(dialog).findByRole("checkbox", {
      name: "review-pr",
    });
    await user.click(box);
    await user.click(importOne(dialog));
    expect(
      await within(dialog).findByText("Prompt over 100 KB"),
    ).toBeInTheDocument();

    await user.click(box);

    expect(
      within(dialog).getByRole("button", { name: "Import prompts" }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("Prompt over 100 KB")).toBeNull();
  });

  it("imports pasted CRLF text with LF line endings", async () => {
    const { imports } = stubServer();
    const user = userEvent.setup();
    const dialog = await openPasteText(user);
    await user.click(field(dialog, "Prompt text"));
    await user.paste(
      "---\r\ndescription: Review\r\n---\r\nRead the diff.\r\nBe brief.\r",
    );
    await user.type(field(dialog, "Name"), "review-pr");
    await user.click(importOne(dialog));

    await waitFor(() =>
      expect(imports).toMatchObject([
        [
          {
            frontmatter: "description: Review",
            text: "Read the diff.\nBe brief.\n",
          },
        ],
      ]),
    );
  });

  it("keeps both texts while switching, imports the example, and fills it from a pasted example key", async () => {
    const { imports } = stubServer();
    const user = userEvent.setup();
    const dialog = await openPasteText(user);
    const show = (part: "Prompt text" | "Example") =>
      user.click(
        within(
          within(dialog).getByRole("group", { name: "Prompt text or example" }),
        ).getByRole("button", { name: part }),
      );
    await user.click(field(dialog, "Prompt text"));
    await user.paste(
      "---\ndescription: Review a pull request\nexample: |\n  Review #12.\n---\nReview $1.\n",
    );
    await show("Example");
    expect(field(dialog, "Example")).toHaveAccessibleDescription(
      "Optional example prompt.",
    );
    expect(field(dialog, "Example")).toHaveValue("Review #12.\n");
    await user.type(field(dialog, "Example"), "Start at sync.ts.");
    await show("Prompt text");
    expect(field(dialog, "Prompt text")).toHaveValue("Review $1.\n");

    await user.type(field(dialog, "Name"), "review-pr");
    await user.click(importOne(dialog));

    await waitFor(() =>
      expect(imports).toMatchObject([
        [{ example: "Review #12.\nStart at sync.ts." }],
      ]),
    );
  });

  it("pastes a file into the Example as it is, drafting no fields", async () => {
    stubServer();
    const user = userEvent.setup();
    const dialog = await openPasteText(user);
    await user.click(
      within(
        within(dialog).getByRole("group", { name: "Prompt text or example" }),
      ).getByRole("button", { name: "Example" }),
    );
    await user.click(field(dialog, "Example"));
    await user.paste(PASTED);

    expect(field(dialog, "Example")).toHaveValue(PASTED);
    expect(field(dialog, "Description")).toHaveValue("");
  });

  it("keeps the dialog open on a click outside once text is typed", async () => {
    stubServer();
    const user = userEvent.setup();
    const dialog = await openPasteText(user);
    await user.type(field(dialog, "Prompt text"), "Go.");

    // Radix registers its outside listener on the next tick, and dismisses on
    // pointerdown.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    expect(screen.getByRole("dialog", { name: "Import prompts" })).toBe(dialog);
  });
});
