import type {
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
import { jsonResponse, renderWithQuery } from "../test-utils";
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
}) {
  const reads: unknown[] = [];
  const edits: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/primitives")) {
        return jsonResponse({ primitives: [PR_REVIEW], unreadTypes: [] });
      }
      if (url === "/api/harness/primitive/delete/check") {
        return jsonResponse(IN_CLONE);
      }
      if (url === "/api/harness/prompt/read") {
        reads.push(JSON.parse(String(init?.body)));
        return jsonResponse(options.read ?? WORKING);
      }
      if (url === "/api/harness/prompt/edit") {
        edits.push(JSON.parse(String(init?.body)));
        return jsonResponse({ name: "pr-review" });
      }
      if (url.startsWith("/api/harness")) {
        return jsonResponse(
          edits.length === 0 ? RELEASED : (options.edited ?? editedRow("edit")),
        );
      }
      return jsonResponse({}, 404);
    }),
  );
  return { reads, edits };
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
      ).toEqual(["Copy prompt", "Edit prompt", "Delete prompt"]),
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
      "Change the description or text.",
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
