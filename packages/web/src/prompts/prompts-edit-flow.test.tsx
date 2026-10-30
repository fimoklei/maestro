import type {
  CategoryList,
  HarnessState,
  InventoryPrimitive,
  PrimitiveDeletionCheck,
} from "@maestro/core";
import type { PromptFile } from "@maestro/core/prompt-file";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RELEASED, row, withStages } from "../harness/harness-flow-fixture";
import { HarnessScreen } from "../harness/harness-screen";
import { jsonResponse, renderWithQuery, sentence } from "../test-utils";
import { PromptsPanel } from "./prompts-panel";

// Edit prompt starts on Prompts and lands on the Harness view (#1675).

const PR_REVIEW = {
  type: "prompt",
  name: "pr-review",
  description: "Review a pull request.",
  path: ".maestro/prompts/pr-review.md",
  pendingRelease: null,
  text: "Review the pull request at [PR LINK].",
  nameValid: true,
} satisfies InventoryPrimitive;

// The Working Harness differs from the Released harness the list shows.
const WORKING: PromptFile = {
  description: "Review a pull request against the spec.",
  text: "Review [PR LINK] for $ARGUMENTS.\nStart at $1.\n",
};

const IN_CLONE = {
  skill: {},
  prompt: {
    "pr-review": {
      inClone: true,
      path: PR_REVIEW.path,
      workingTree: "blob-1",
      uncommitted: false,
      localOnly: false,
    },
  },
} satisfies Record<"skill" | "prompt", Record<string, PrimitiveDeletionCheck>>;

const editedRow = (change: "edit" | "addition"): HarnessState =>
  withStages(RELEASED, {
    proposal: [
      row("pending-proposal", "pr-review", "not-yet-proposed", {
        type: "prompt",
        path: PR_REVIEW.path,
        branch: "maestro/prompt.pr-review",
        change,
      }),
    ],
  });

function stubServer(options: {
  read?: PromptFile;
  /** The Harness read once the edit landed. */
  edited?: HarnessState;
  /** The Harness read before any edit. */
  harness?: HarnessState;
  prompts?: InventoryPrimitive[];
  /** The read's refusal code, with its HTTP status. */
  readRefusal?: [string, number];
  editRefusal?: [string, number];
  /** The name the edit answers with: another one is a rename. */
  editedName?: string;
  /** The prompt's category before the edit; none by default. */
  category?: string;
  /** The assign route's refusal code, with its HTTP status. */
  assignRefusal?: [string, number];
}) {
  const reads: unknown[] = [];
  const edits: unknown[] = [];
  const assigns: unknown[] = [];
  const names = ["Docs", "Planning"];
  let assignments: CategoryList["assignments"] =
    options.category === undefined
      ? []
      : [{ type: "prompt", name: "pr-review", category: options.category }];
  const list = (): CategoryList => ({
    categories: names.map((name) => ({
      name,
      skills: 0,
      prompts: assignments.filter((each) => each.category === name).length,
    })),
    assignments,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/primitives")) {
        return jsonResponse({
          primitives: options.prompts ?? [PR_REVIEW],
          unreadTypes: [],
        });
      }
      if (url === "/api/harness/primitive/delete/check") {
        return jsonResponse(IN_CLONE);
      }
      if (url === "/api/harness/prompt/read") {
        reads.push(JSON.parse(String(init?.body)));
        return options.readRefusal === undefined
          ? jsonResponse(options.read ?? WORKING)
          : jsonResponse(
              { error: options.readRefusal[0] },
              options.readRefusal[1],
            );
      }
      if (url === "/api/categories/assign") {
        const body = JSON.parse(String(init?.body));
        assigns.push(body);
        if (options.assignRefusal !== undefined) {
          return jsonResponse(
            { error: options.assignRefusal[0] },
            options.assignRefusal[1],
          );
        }
        assignments = [
          ...assignments.filter((each) => each.name !== body.items[0].name),
          ...(body.category === null
            ? []
            : [{ ...body.items[0], category: body.category }]),
        ];
        return jsonResponse(list());
      }
      if (url === "/api/categories") {
        return jsonResponse(list());
      }
      if (url === "/api/harness/prompt/edit") {
        edits.push(JSON.parse(String(init?.body)));
        return options.editRefusal === undefined
          ? jsonResponse({ name: options.editedName ?? "pr-review" })
          : jsonResponse(
              { error: options.editRefusal[0] },
              options.editRefusal[1],
            );
      }
      if (url.startsWith("/api/harness")) {
        return jsonResponse(
          edits.length === 0
            ? (options.harness ?? RELEASED)
            : (options.edited ?? editedRow("edit")),
        );
      }
      return jsonResponse({}, 404);
    }),
  );
  return { reads, edits, assigns };
}

function renderPrompts() {
  renderWithQuery(
    <MemoryRouter initialEntries={["/inventory/prompts"]}>
      <Routes>
        <Route path="inventory/prompts" element={<PromptsPanel />} />
        <Route path="harness" element={<HarnessScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openRowMenu() {
  await userEvent.click(
    await screen.findByRole("button", { name: "Actions for pr-review" }),
  );
  return within(await screen.findByRole("menu"));
}

async function openPane() {
  await userEvent.click(
    await screen.findByText("pr-review", { selector: "td *" }),
  );
  return within(
    await screen.findByRole("complementary", { name: "pr-review detail" }),
  );
}

async function editFromMenu() {
  const menu = await openRowMenu();
  await userEvent.click(
    await menu.findByRole("menuitem", { name: "Edit prompt" }),
  );
  return screen.findByRole("dialog", { name: "Edit pr-review" });
}

const confirmOf = (dialog: HTMLElement) =>
  within(dialog).getByRole("button", { name: /^Edit prompt/ });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Prompts — Edit prompt", () => {
  it("lists Edit prompt after Copy prompt, before the divider and Delete prompt", async () => {
    stubServer({});
    renderPrompts();
    const menu = await openRowMenu();

    await waitFor(() =>
      expect(
        menu.getAllByRole("menuitem").map((item) => item.textContent),
      ).toEqual([
        "Copy prompt",
        "Edit prompt",
        "Set category",
        "Delete prompt",
      ]),
    );
    expect(menu.getAllByRole("separator")).toHaveLength(1);
  });

  it("opens the dialog from the pane's secondary button", async () => {
    const { reads } = stubServer({});
    renderPrompts();
    const pane = await openPane();

    await userEvent.click(pane.getByRole("button", { name: "Edit prompt" }));

    await screen.findByRole("dialog", { name: "Edit pr-review" });
    expect(reads).toEqual([{ name: "pr-review" }]);
  });

  it("fills the dialog from the Working Harness, with the name fixed and no source tabs", async () => {
    stubServer({});
    renderPrompts();

    const dialog = within(await editFromMenu());

    expect(dialog.getByText("Name")).toBeInTheDocument();
    expect(dialog.getByText("pr-review")).toBeInTheDocument();
    expect(dialog.queryByRole("textbox", { name: /^Name/ })).toBeNull();
    expect(dialog.queryByRole("radiogroup")).toBeNull();
    expect(dialog.queryByText("Paste text")).toBeNull();
    expect(dialog.getByRole("textbox", { name: /^Description/ })).toHaveValue(
      WORKING.description,
    );
    expect(dialog.getByRole("textbox", { name: /^Prompt text/ })).toHaveValue(
      WORKING.text,
    );
  });

  it("blocks Edit prompt until a field changes, and says why", async () => {
    stubServer({});
    renderPrompts();
    const dialog = await editFromMenu();
    const confirm = confirmOf(dialog);

    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(confirm).toHaveAccessibleDescription(
      "Change the description, text or category.",
    );

    const description = within(dialog).getByRole("textbox", {
      name: /^Description/,
    });
    await userEvent.type(description, "!");
    await waitFor(() =>
      expect(confirmOf(dialog)).not.toHaveAttribute("aria-disabled"),
    );
    await userEvent.type(description, "{Backspace}");
    await waitFor(() =>
      expect(confirmOf(dialog)).toHaveAttribute("aria-disabled", "true"),
    );
  });

  it("counts a CRLF file as unchanged until a field changes", async () => {
    stubServer({
      read: { description: "Review it.", text: "Line one.\r\nLine two.\r\n" },
    });
    renderPrompts();
    const dialog = await editFromMenu();

    expect(confirmOf(dialog)).toHaveAttribute("aria-disabled", "true");
  });

  it("shows a field error only on submit, and sends nothing", async () => {
    const { edits } = stubServer({});
    renderPrompts();
    const dialog = await editFromMenu();
    await userEvent.clear(
      within(dialog).getByRole("textbox", { name: /^Description/ }),
    );

    expect(within(dialog).queryByText("Enter a description.")).toBeNull();
    await userEvent.click(confirmOf(dialog));

    expect(
      await within(dialog).findByText("Enter a description."),
    ).toBeInTheDocument();
    expect(edits).toEqual([]);
  });

  it.each([
    ["Changed", "edit"],
    ["Added", "addition"],
  ] as const)(
    "lands on the Harness view with the row selected, showing %s",
    async (word, change) => {
      const { edits } = stubServer({ edited: editedRow(change) });
      renderPrompts();
      const dialog = await editFromMenu();
      const text = within(dialog).getByRole("textbox", {
        name: /^Prompt text/,
      });
      await userEvent.clear(text);
      await userEvent.type(text, "Review [[PR LINK] in full.");
      await userEvent.click(confirmOf(dialog));

      const pane = await screen.findByRole("complementary", {
        name: "pr-review detail",
      });
      expect(within(pane).getByText(word)).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(edits).toEqual([
        {
          name: "pr-review",
          description: WORKING.description,
          text: "Review [PR LINK] in full.",
          read: WORKING,
        },
      ]);
    },
  );

  it("lands with nothing selected and no error when the edit restores the default-branch text", async () => {
    stubServer({ edited: RELEASED });
    renderPrompts();
    const dialog = await editFromMenu();
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /^Description/ }),
      "!",
    );
    await userEvent.click(confirmOf(dialog));

    await screen.findByRole("heading", { name: "Harness" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("writes nothing on Cancel, and works by keyboard alone", async () => {
    const { edits } = stubServer({});
    renderPrompts();
    (
      await screen.findByRole("button", { name: "Actions for pr-review" })
    ).focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menu");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    const dialog = await screen.findByRole("dialog", {
      name: "Edit pr-review",
    });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("textbox", { name: /^Description/ }),
      ).toHaveFocus(),
    );

    await userEvent.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(edits).toEqual([]);
  });
});

const notInClone = (message: string) => ({
  label: "Prompt not in your clone",
  message,
  detail:
    "pr-review is on github.com/fimoklei/agent-harness but not in your clone.",
});

// The Harness holds a deletion of the prompt that Restore prompt undoes.
const DELETED_HERE = withStages(RELEASED, {
  proposal: [
    row("pending-proposal", "pr-review", "not-yet-proposed", {
      type: "prompt",
      path: PR_REVIEW.path,
      branch: "maestro/prompt.pr-review",
      change: "deletion",
      restorable: true,
    }),
  ],
});

async function expectPaneNotice(notice: ReturnType<typeof notInClone>) {
  const pane = within(
    await screen.findByRole("complementary", { name: "pr-review detail" }),
  );
  expect(await pane.findByText(notice.label)).toBeInTheDocument();
  expect(pane.getByText(sentence(notice.message))).toBeInTheDocument();
  expect(pane.getByText(sentence(notice.detail))).toBeInTheDocument();
}

async function submitChangedText(dialog: HTMLElement, typed: string) {
  const text = within(dialog).getByRole("textbox", { name: /^Prompt text/ });
  await userEvent.clear(text);
  await userEvent.type(text, typed);
  await userEvent.click(confirmOf(dialog));
}

describe("Prompts — Edit prompt refusals", () => {
  it("states a local deletion instead of opening the dialog", async () => {
    stubServer({
      harness: DELETED_HERE,
      readRefusal: ["prompt-missing", 404],
    });
    renderPrompts();
    await screen.findByText("github.com/fimoklei/agent-harness");
    const menu = await openRowMenu();
    await userEvent.click(
      await menu.findByRole("menuitem", { name: "Edit prompt" }),
    );

    await expectPaneNotice(
      notInClone("Select Harness, then select Restore prompt."),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("states a clone that is behind instead of opening the dialog", async () => {
    stubServer({ readRefusal: ["prompt-missing", 404] });
    renderPrompts();
    await screen.findByText("github.com/fimoklei/agent-harness");
    const pane = await openPane();

    await userEvent.click(pane.getByRole("button", { name: "Edit prompt" }));

    await expectPaneNotice(
      notInClone(
        "Pull the latest changes in your Git tool, then select Edit prompt again.",
      ),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["a name that is not valid", { name: "Fix Tests", nameValid: false }],
    [
      "a pending deletion",
      {
        pendingRelease: {
          change: "deletion",
          renamedTo: null,
          defaultBranch: "main",
        },
      },
    ],
    [
      "a pending rename",
      {
        pendingRelease: {
          change: "rename",
          renamedTo: "review-pr",
          defaultBranch: "main",
        },
      },
    ],
  ] as const)(
    "omits Edit prompt from the menu and blocks it in the pane for %s",
    async (_, over) => {
      const prompt = { ...PR_REVIEW, ...over };
      const { reads } = stubServer({ prompts: [prompt] });
      renderPrompts();
      await userEvent.click(
        await screen.findByRole("button", {
          name: `Actions for ${prompt.name}`,
        }),
      );
      const menu = within(await screen.findByRole("menu"));
      expect(
        menu.getByRole("menuitem", { name: "Copy prompt" }),
      ).toBeInTheDocument();
      expect(menu.queryByRole("menuitem", { name: "Edit prompt" })).toBeNull();
      await userEvent.keyboard("{Escape}");

      await userEvent.click(
        await screen.findByText(prompt.name, { selector: "td *" }),
      );
      const pane = within(
        await screen.findByRole("complementary", {
          name: `${prompt.name} detail`,
        }),
      );
      const button = pane.getByRole("button", { name: "Edit prompt" });
      expect(button).toHaveAttribute("aria-disabled", "true");
      await userEvent.click(button);
      expect(reads).toEqual([]);
    },
  );

  it.each([
    [
      "the file changed",
      ["prompt-changed", 409],
      {
        label: "Prompt out of date",
        message:
          "Nothing was edited. Copy your text, select Close, then select Edit prompt again.",
        detail: "The pr-review file changed after this dialog opened.",
      },
    ],
    [
      "the file is gone",
      ["prompt-missing", 404],
      {
        label: "Prompt not in your clone",
        message:
          "Nothing was edited. Select Harness, then select Restore prompt.",
        detail:
          "Something removed the pr-review file from your clone after this dialog opened.",
      },
    ],
    [
      "another Harness write runs",
      ["import-in-progress", 409],
      {
        label: "Harness busy",
        message:
          "Wait for that change to finish, then select Edit prompt again.",
        detail: "Maestro changes one Harness at a time.",
      },
    ],
  ] as const)(
    "keeps the typed text and states it when %s",
    async (_, refusal, notice) => {
      stubServer({ editRefusal: [...refusal] });
      renderPrompts();
      const dialog = await editFromMenu();

      await submitChangedText(dialog, "Review it again.");

      const shown = within(dialog);
      expect(await shown.findByText(notice.label)).toBeInTheDocument();
      expect(shown.getByText(sentence(notice.message))).toBeInTheDocument();
      expect(shown.getByText(sentence(notice.detail))).toBeInTheDocument();
      expect(shown.getByRole("textbox", { name: /^Prompt text/ })).toHaveValue(
        "Review it again.",
      );
      expect(confirmOf(dialog)).not.toHaveAttribute("aria-disabled");
    },
  );
});

const categoryField = (dialog: HTMLElement, value: string) =>
  within(dialog).findByRole("button", { name: `Category ${value}` });

async function pickCategory(dialog: HTMLElement, from: string, to: string) {
  await userEvent.click(await categoryField(dialog, from));
  const menu = within(screen.getByRole("group", { name: "Category" }));
  await userEvent.click(menu.getByRole("option", { name: to }));
}

// The screen's own region; a notice carries a role of its own.
const region = () =>
  screen
    .getAllByRole("status")
    .find((each) => each.classList.contains("sr-only"));

describe("Prompts — Edit prompt's Category field", () => {
  it("shows the prompt's current category, under the hint drawn on the canvas", async () => {
    stubServer({ category: "Planning" });
    renderPrompts();
    const dialog = await editFromMenu();

    const field = await categoryField(dialog, "Planning");
    expect(field).toHaveAccessibleDescription("Only you see this category.");
    await userEvent.click(field);
    const menu = within(screen.getByRole("group", { name: "Category" }));
    expect(menu.getByRole("option", { name: /Planning/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("closes only the menu on Escape, and returns focus to the field", async () => {
    stubServer({ category: "Planning" });
    renderPrompts();
    const dialog = await editFromMenu();
    await userEvent.click(await categoryField(dialog, "Planning"));
    screen.getByRole("group", { name: "Category" });

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("group", { name: "Category" })).toBeNull();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(await categoryField(dialog, "Planning")).toHaveFocus();
  });

  it("shows No category for a prompt without one", async () => {
    stubServer({});
    renderPrompts();
    const dialog = await editFromMenu();

    expect(await categoryField(dialog, "No category")).toBeInTheDocument();
  });

  it("sets only the category, writing nothing to the Harness, and stays on Prompts", async () => {
    const { edits, assigns } = stubServer({ category: "Planning" });
    renderPrompts();
    const dialog = await editFromMenu();

    await pickCategory(dialog, "Planning", "Docs");
    expect(await categoryField(dialog, "Docs")).toBeInTheDocument();
    await userEvent.click(confirmOf(dialog));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(assigns).toEqual([
      { items: [{ type: "prompt", name: "pr-review" }], category: "Docs" },
    ]);
    expect(edits).toEqual([]);
    expect(screen.queryByRole("heading", { name: "Harness" })).toBeNull();
    await waitFor(() =>
      expect(region()).toHaveTextContent("Category set for pr-review."),
    );
  });

  it("writes the text to the Harness, then assigns the category", async () => {
    const { edits, assigns } = stubServer({});
    renderPrompts();
    const dialog = await editFromMenu();

    await pickCategory(dialog, "No category", "Planning");
    await submitChangedText(dialog, "Review it again.");

    await screen.findByRole("complementary", { name: "pr-review detail" });
    expect(edits).toHaveLength(1);
    expect(assigns).toEqual([
      { items: [{ type: "prompt", name: "pr-review" }], category: "Planning" },
    ]);
  });

  it("assigns nothing when only the text changed", async () => {
    const { edits, assigns } = stubServer({ category: "Planning" });
    renderPrompts();
    const dialog = await editFromMenu();

    await submitChangedText(dialog, "Review it again.");

    await screen.findByRole("complementary", { name: "pr-review detail" });
    expect(edits).toHaveLength(1);
    expect(assigns).toEqual([]);
  });

  it("keeps the category under the name the edit answers with", async () => {
    const { assigns } = stubServer({
      category: "Planning",
      editedName: "review-pr",
    });
    renderPrompts();
    const dialog = await editFromMenu();

    await submitChangedText(dialog, "Review it again.");

    await waitFor(() =>
      expect(assigns).toEqual([
        {
          items: [{ type: "prompt", name: "review-pr" }],
          category: "Planning",
        },
      ]),
    );
  });

  it("keeps the edit and says the category was not set when the assign fails", async () => {
    const { edits } = stubServer({
      assignRefusal: ["categories-unreadable", 500],
    });
    renderPrompts();
    const dialog = await editFromMenu();

    await pickCategory(dialog, "No category", "Planning");
    await submitChangedText(dialog, "Review it again.");

    const shown = within(dialog);
    expect(await shown.findByText("Category not set")).toBeInTheDocument();
    expect(
      shown.getByText(
        sentence(
          "The prompt was edited. Select Close, then select Set category on Prompts.",
        ),
      ),
    ).toBeInTheDocument();
    expect(edits).toHaveLength(1);
    expect(shown.queryByRole("button", { name: /^Edit prompt/ })).toBeNull();
    expect(shown.getByRole("textbox", { name: /^Prompt text/ })).toBeDisabled();
    expect(shown.getByRole("button", { name: /^Category/ })).toBeDisabled();

    await userEvent.click(shown.getByText("Close", { selector: "button" }));

    await screen.findByRole("complementary", { name: "pr-review detail" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
