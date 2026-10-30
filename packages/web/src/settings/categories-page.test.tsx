import type { CategoryList } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectTooltipCause,
  jsonResponse,
  renderWithQuery,
  sentence,
} from "../test-utils";
import { ToastHost } from "../ui/toast";
import { CategoriesPage } from "./categories-page";

afterEach(() => {
  vi.unstubAllGlobals();
  // Sonner keeps toasts in a module-global store.
  toast.dismiss();
});

type Category = CategoryList["categories"][number];

const category = (name: string, skills = 0, prompts = 0): Category => ({
  name,
  skills,
  prompts,
});

const list = (categories: Category[]) =>
  ({ categories, assignments: [] }) satisfies CategoryList;

type Answer = Response | Promise<Response>;

const sorted = (categories: Category[]) =>
  [...categories].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );

// The server keeps the list; each write answers the list as core sorts it.
function stubServer({
  categories = [],
  read,
  add,
  rename,
  remove,
}: {
  categories?: Category[];
  read?: () => Answer;
  add?: (name: string) => Answer;
  rename?: () => Answer;
  remove?: () => Answer;
} = {}) {
  let saved = categories;
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/categories/rename") {
        if (rename) return rename();
        const { from, to } = JSON.parse(String(init?.body)) as {
          from: string;
          to: string;
        };
        saved = sorted(
          saved.map((each) =>
            each.name === from ? { ...each, name: to.trim() } : each,
          ),
        );
        return jsonResponse(list(saved));
      }
      if (url === "/api/categories/delete") {
        if (remove) return remove();
        const { name, moveTo } = JSON.parse(String(init?.body)) as {
          name: string;
          moveTo: string | null;
        };
        const gone = saved.find((each) => each.name === name);
        saved = saved
          .filter((each) => each.name !== name)
          .map((each) =>
            each.name === moveTo && gone !== undefined
              ? {
                  ...each,
                  skills: each.skills + gone.skills,
                  prompts: each.prompts + gone.prompts,
                }
              : each,
          );
        return jsonResponse(list(saved));
      }
      if (url === "/api/categories" && init?.method === "POST") {
        const { name } = JSON.parse(String(init.body)) as { name: string };
        if (add) return add(name);
        const added = name.trim();
        saved = [...saved, category(added)].sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        );
        return jsonResponse({ ...list(saved), added });
      }
      if (url === "/api/categories") {
        return read ? read() : jsonResponse(list(saved));
      }
      throw new Error(`unexpected ${init?.method ?? "GET"} ${url}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  const posts = () =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)));
  return { posts };
}

const renderPage = () =>
  renderWithQuery(
    <MemoryRouter initialEntries={["/settings/categories"]}>
      <CategoriesPage />
    </MemoryRouter>,
  );

const rows = () =>
  within(screen.getByRole("list", { name: "Categories" })).getAllByRole(
    "listitem",
  );

const openAdd = async () => {
  await userEvent.click(
    await screen.findByRole("button", { name: "Add category" }),
  );
  return screen.getByRole("dialog", { name: "Add a category" });
};

const submit = (dialog: HTMLElement) =>
  userEvent.click(within(dialog).getByRole("button", { name: "Add category" }));

describe("Settings › Categories", () => {
  it("states that the categories stay on this computer", async () => {
    stubServer();
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Categories" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Categories stay on this computer. Only you see them.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the empty state for a Harness with no categories", async () => {
    stubServer();
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "No categories yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Categories appear here.")).toBeInTheDocument();
  });

  it("lists each category in the server's order with its counts", async () => {
    stubServer({
      categories: [
        category("Code review", 2, 1),
        category("Planning", 3, 2),
        category("Release notes"),
        category("Writing", 1, 0),
        category("Prompts only", 0, 1),
      ],
    });
    renderPage();

    await screen.findByText("Code review");
    expect(rows().map((row) => row.textContent)).toEqual([
      "Code review2 skills · 1 prompt",
      "Planning3 skills · 2 prompts",
      "Release notesNo skills or prompts",
      "Writing1 skill",
      "Prompts only1 prompt",
    ]);
  });

  it("links each count to Skills or Prompts filtered to its category", async () => {
    stubServer({
      categories: [
        category("Code review", 2, 1),
        category("Release notes"),
        category("Writing", 1, 0),
        category("Q&A", 0, 1),
      ],
    });
    renderPage();

    await screen.findByText("Code review");
    const links = screen.getAllByRole("link");
    expect(
      links.map((link) => [
        link.textContent,
        link.getAttribute("aria-label"),
        link.getAttribute("href"),
      ]),
    ).toEqual([
      [
        "2 skills",
        "2 skills in Code review",
        "/inventory/skills?category=Code+review",
      ],
      [
        "1 prompt",
        "1 prompt in Code review",
        "/inventory/prompts?category=Code+review",
      ],
      ["1 skill", "1 skill in Writing", "/inventory/skills?category=Writing"],
      ["1 prompt", "1 prompt in Q&A", "/inventory/prompts?category=Q%26A"],
    ]);
    expect(
      within(rows()[1] as HTMLElement).queryByRole("link"),
    ).not.toBeInTheDocument();
  });

  it("adds a category: the dialog closes, the new row sits selected in its place, and the add is announced", async () => {
    stubServer({ categories: [category("Code review"), category("Planning")] });
    renderPage();

    const dialog = await openAdd();
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveFocus();
    await userEvent.type(within(dialog).getByRole("textbox"), " Docs {Enter}");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const added = rows()[1];
    expect(added).toHaveTextContent("Docs");
    expect(added).toHaveAttribute("aria-current", "true");
    await waitFor(() => expect(rows()[1]).toHaveFocus());
    expect(screen.getByRole("status")).toHaveTextContent("Added Docs.");
  });

  it("refuses an empty name on submit without asking the server", async () => {
    const { posts } = stubServer();
    renderPage();

    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByRole("textbox"), "   ");
    await submit(dialog);

    expect(within(dialog).getByText("Enter a name.")).toBeInTheDocument();
    expect(posts()).toEqual([]);
  });

  it("refuses a name over 64 characters, and one with a tab", async () => {
    const { posts } = stubServer();
    renderPage();

    const dialog = await openAdd();
    const field = within(dialog).getByRole("textbox");
    await userEvent.type(field, "x".repeat(65));
    await submit(dialog);
    expect(
      within(dialog).getByText("Enter at most 64 characters."),
    ).toBeInTheDocument();

    await userEvent.clear(field);
    await userEvent.type(field, "Code\treview");
    await submit(dialog);
    expect(posts()).toEqual([]);
  });

  it("refuses No category in any case, the name of the group without one", async () => {
    const { posts } = stubServer();
    renderPage();

    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByRole("textbox"), "no Category");
    await submit(dialog);

    expect(
      within(dialog).getByText("Enter a name other than No category."),
    ).toBeInTheDocument();
    expect(posts()).toEqual([]);
  });

  it("refuses a name that exists ignoring case, naming the existing category", async () => {
    const { posts } = stubServer({ categories: [category("Code review")] });
    renderPage();

    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByRole("textbox"), "code review");
    await submit(dialog);

    expect(
      within(dialog).getByText("Code review already exists."),
    ).toBeInTheDocument();
    expect(posts()).toEqual([]);
  });

  it("states the server's refusal of an existing name by the name it holds", async () => {
    stubServer({
      add: () =>
        jsonResponse({ error: "name-exists", existing: "Code review" }, 409),
    });
    renderPage();

    const dialog = await openAdd();
    await userEvent.type(within(dialog).getByRole("textbox"), "code review");
    await submit(dialog);

    expect(
      await within(dialog).findByText("Code review already exists."),
    ).toBeInTheDocument();
  });

  it("names the config file to repair when the categories section is broken", async () => {
    stubServer({
      read: () =>
        jsonResponse(
          {
            error: "categories-unreadable",
            configPath: "/Users/me/.maestro/config.json",
          },
          500,
        ),
    });
    renderPage();

    const notice = await screen.findByText(/^Categories not read/);
    expect(notice.closest("[role]")).toHaveTextContent(
      "/Users/me/.maestro/config.json",
    );
    expect(
      screen.getByRole("button", { name: "Add category" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("sends the operator to Change Harness location while no Harness is connected", async () => {
    stubServer({
      read: () => jsonResponse({ error: "not-configured" }, 409),
    });
    renderPage();

    expect(await screen.findByText("No Harness connected")).toBeInTheDocument();
    expect(
      screen.getByText("Select Change Harness location in Settings."),
    ).toBeInTheDocument();
  });

  it("re-reads the list with Re-read Categories beside Add category", async () => {
    let held = [category("Planning")];
    stubServer({ read: () => jsonResponse(list(held)) });
    renderPage();

    await screen.findByText("Planning");
    held = [category("Docs"), category("Planning")];
    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Categories" }),
    );

    expect(await screen.findByText("Docs")).toBeInTheDocument();
    expect(rows()).toHaveLength(2);
  });

  it("re-reads the categories with Re-read Categories after a failed read", async () => {
    let fail = true;
    stubServer({
      categories: [category("Planning")],
      read: () =>
        fail
          ? Promise.reject(new TypeError("offline"))
          : jsonResponse(list([category("Planning")])),
    });
    renderPage();

    expect(
      await screen.findByText(
        sentence("Select Re-read Categories to try again."),
      ),
    ).toBeInTheDocument();
    fail = false;
    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Categories" }),
    );

    expect(await screen.findByText("Planning")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add category" }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("reads the list again once the operator repairs the broken section", async () => {
    let broken = true;
    stubServer({
      read: () =>
        broken
          ? jsonResponse(
              {
                error: "categories-unreadable",
                configPath: "/Users/me/.maestro/config.json",
              },
              500,
            )
          : jsonResponse(list([category("Planning")])),
    });
    renderPage();

    expect(
      await screen.findByText(
        sentence(
          "Repair the categories in /Users/me/.maestro/config.json manually. Then select Re-read Categories to try again.",
        ),
      ),
    ).toBeInTheDocument();
    broken = false;
    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Categories" }),
    );

    expect(await screen.findByText("Planning")).toBeInTheDocument();
    expect(screen.queryByText(/^Categories not read/)).not.toBeInTheDocument();
  });
});

const renderWithToasts = () =>
  renderWithQuery(
    <MemoryRouter initialEntries={["/settings/categories"]}>
      <CategoriesPage />
      <ToastHost />
    </MemoryRouter>,
  );

const rowMenu = async (name: string) => {
  await userEvent.click(
    await screen.findByRole("button", { name: `Actions for ${name}` }),
  );
  return screen.getByRole("menu");
};

const openRename = async (name: string) => {
  const menu = await rowMenu(name);
  await userEvent.click(
    within(menu).getByRole("menuitem", { name: "Rename category" }),
  );
  return screen.findByRole("dialog", { name: `Rename ${name}` });
};

const openDelete = async (name: string) => {
  const menu = await rowMenu(name);
  await userEvent.click(
    within(menu).getByRole("menuitem", { name: "Delete category" }),
  );
  return screen.findByRole("dialog", { name: `Delete ${name}` });
};

describe("Settings › Categories, rename and delete", () => {
  it("offers Rename category and Delete category in each row's ⋮", async () => {
    stubServer({ categories: [category("Planning", 3, 2)] });
    renderPage();

    const menu = await rowMenu("Planning");

    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Rename category", "Delete category"]);
  });

  describe("Rename category", () => {
    it("opens on the name with what follows it, and asks for a change first", async () => {
      const { posts } = stubServer({
        categories: [category("Planning", 3, 2)],
      });
      renderPage();

      const dialog = await openRename("Planning");
      const field = within(dialog).getByRole("textbox", { name: "Name" });

      expect(field).toHaveValue("Planning");
      await waitFor(() => expect(field).toHaveFocus());
      expect(field).toHaveAccessibleDescription(
        "Its 3 skills and 2 prompts show the new name.",
      );
      const rename = within(dialog).getByRole("button", {
        name: "Rename category",
      });
      expect(rename).toHaveAttribute("aria-disabled", "true");
      expectTooltipCause(rename, "Change the name.");
      await userEvent.click(rename);
      expect(posts()).toEqual([]);
    });

    it("renames: the dialog closes, the row sits selected under its new name, and the rename is announced", async () => {
      const { posts } = stubServer({
        categories: [category("Code review"), category("Planning", 3, 2)],
      });
      renderPage();

      const dialog = await openRename("Planning");
      const field = within(dialog).getByRole("textbox", { name: "Name" });
      await userEvent.clear(field);
      await userEvent.type(field, "Assets{Enter}");

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(posts()).toEqual([{ from: "Planning", to: "Assets" }]);
      const renamed = rows()[0];
      expect(renamed).toHaveTextContent("Assets3 skills · 2 prompts");
      expect(renamed).toHaveAttribute("aria-current", "true");
      await waitFor(() => expect(rows()[0]).toHaveFocus());
      expect(screen.getByRole("status")).toHaveTextContent("Renamed Assets.");
    });

    it("allows a change of case only", async () => {
      const { posts } = stubServer({ categories: [category("release notes")] });
      renderPage();

      const dialog = await openRename("release notes");
      const field = within(dialog).getByRole("textbox", { name: "Name" });
      expect(field).not.toHaveAttribute("aria-describedby");
      await userEvent.clear(field);
      await userEvent.type(field, "Release notes{Enter}");

      await waitFor(() =>
        expect(posts()).toEqual([
          { from: "release notes", to: "Release notes" },
        ]),
      );
    });

    it("refuses another category's name ignoring case, naming it, without asking the server", async () => {
      const { posts } = stubServer({
        categories: [category("Planning", 3, 2), category("Writing", 1)],
      });
      renderPage();

      const dialog = await openRename("Planning");
      const field = within(dialog).getByRole("textbox", { name: "Name" });
      await userEvent.clear(field);
      await userEvent.type(field, "writing{Enter}");

      expect(
        within(dialog).getByText("Writing already exists."),
      ).toBeInTheDocument();
      expect(posts()).toEqual([]);
    });

    it("states the server's refusal of an existing name by the name it holds", async () => {
      stubServer({
        categories: [category("Planning")],
        rename: () =>
          jsonResponse({ error: "name-exists", existing: "Docs" }, 409),
      });
      renderPage();

      const dialog = await openRename("Planning");
      const field = within(dialog).getByRole("textbox", { name: "Name" });
      await userEvent.clear(field);
      await userEvent.type(field, "docs{Enter}");

      expect(
        await within(dialog).findByText("Docs already exists."),
      ).toBeInTheDocument();
    });

    it("states a failed rename in the dialog", async () => {
      stubServer({
        categories: [category("Planning")],
        rename: () => Promise.reject(new TypeError("offline")),
      });
      renderPage();

      const dialog = await openRename("Planning");
      const field = within(dialog).getByRole("textbox", { name: "Name" });
      await userEvent.type(field, "s{Enter}");

      expect(
        await within(dialog).findByText("Category not renamed"),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          sentence("Select Rename category to try again."),
        ),
      ).toBeInTheDocument();
    });
  });

  describe("Delete category", () => {
    it("moves the items to the chosen category, then deletes it and says so in a toast", async () => {
      const { posts } = stubServer({
        categories: [
          category("Code review", 2, 1),
          category("Planning", 3, 2),
          category("Writing", 1),
        ],
      });
      renderWithToasts();

      const dialog = await openDelete("Planning");
      expect(
        within(dialog).getByText(
          "Its 3 skills and 2 prompts move to the category you choose. They stay in the Harness.",
        ),
      ).toBeInTheDocument();
      const moveTo = within(dialog).getByRole("button", { name: /^Move to/ });
      expect(moveTo).toHaveTextContent("No category");
      await userEvent.click(moveTo);
      const menu = within(dialog).getByRole("listbox", { name: "Move to" });
      expect(
        within(menu)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["✓No category", "Code review", "Writing"]);
      await userEvent.click(
        within(menu).getByRole("option", { name: "Writing" }),
      );
      expect(moveTo).toHaveTextContent("Writing");
      expect(moveTo).toHaveFocus();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Delete category" }),
      );

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(posts()).toEqual([{ name: "Planning", moveTo: "Writing" }]);
      expect(rows().map((row) => row.textContent)).toEqual([
        "Code review2 skills · 1 prompt",
        "Writing4 skills · 2 prompts",
      ]);
      expect(
        await screen.findByText(sentence("Deleted Planning.")),
      ).toBeInTheDocument();
      // Focus goes to the row now where the deleted one stood.
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Actions for Writing" }),
        ).toHaveFocus(),
      );
    });

    it("moves the items to No category unless another is chosen", async () => {
      const { posts } = stubServer({ categories: [category("Planning", 1)] });
      renderPage();

      const dialog = await openDelete("Planning");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Delete category" }),
      );

      await waitFor(() =>
        expect(posts()).toEqual([{ name: "Planning", moveTo: null }]),
      );
    });

    it("adds a new category typed in Move to, then moves the items into it", async () => {
      const { posts } = stubServer({
        categories: [category("Planning", 0, 2)],
      });
      renderPage();

      const dialog = await openDelete("Planning");
      await userEvent.click(
        within(dialog).getByRole("button", { name: /^Move to/ }),
      );
      await userEvent.type(
        within(dialog).getByRole("combobox", { name: "Search categories" }),
        "Notes{Enter}",
      );
      const moveTo = await within(dialog).findByRole("button", {
        name: /^Move to/,
      });
      await waitFor(() => expect(moveTo).toHaveTextContent("Notes"));
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Delete category" }),
      );

      await waitFor(() =>
        expect(posts()).toEqual([
          { name: "Notes" },
          { name: "Planning", moveTo: "Notes" },
        ]),
      );
    });

    it("waits for an add still running in Move to when Delete category is pressed, then moves the items into it", async () => {
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const { posts } = stubServer({
        categories: [category("Planning", 0, 2)],
        add: async (name) => {
          await held;
          return jsonResponse({
            ...list([category(name), category("Planning", 0, 2)]),
            added: name,
          });
        },
      });
      renderPage();

      const dialog = await openDelete("Planning");
      await userEvent.click(
        within(dialog).getByRole("button", { name: /^Move to/ }),
      );
      await userEvent.type(
        within(dialog).getByRole("combobox", { name: "Search categories" }),
        "Notes{Enter}",
      );
      // The press closes the menu while the add is still on its way.
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Delete category" }),
      );
      expect(posts()).toEqual([{ name: "Notes" }]);
      release();

      await waitFor(() =>
        expect(posts()).toEqual([
          { name: "Notes" },
          { name: "Planning", moveTo: "Notes" },
        ]),
      );
    });

    it("closes Move to on Escape and keeps the dialog open", async () => {
      stubServer({
        categories: [category("Planning", 1), category("Writing")],
      });
      renderPage();

      const dialog = await openDelete("Planning");
      const moveTo = within(dialog).getByRole("button", { name: /^Move to/ });
      await userEvent.click(moveTo);
      await userEvent.keyboard("{Escape}");

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(within(dialog).queryByRole("listbox")).not.toBeInTheDocument();
      expect(moveTo).toHaveFocus();
    });

    it("asks nothing about moving for an empty category, and opens on Cancel", async () => {
      const { posts } = stubServer({
        categories: [category("Planning", 1), category("Release notes")],
      });
      renderPage();

      const dialog = await openDelete("Release notes");

      expect(
        within(dialog).getByText(
          sentence("No skills or prompts are in Release notes."),
        ),
      ).toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: /^Move to/ }),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          within(dialog).getByRole("button", { name: "Cancel" }),
        ).toHaveFocus(),
      );
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Delete category" }),
      );
      await waitFor(() =>
        expect(posts()).toEqual([{ name: "Release notes", moveTo: null }]),
      );
    });

    it("states a failed delete in the dialog and keeps the row", async () => {
      stubServer({
        categories: [category("Planning", 1)],
        remove: () => jsonResponse({ error: "category-not-found" }, 404),
      });
      renderPage();

      const dialog = await openDelete("Planning");
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Delete category" }),
      );

      expect(
        await within(dialog).findByText("Category not deleted"),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(
          sentence(
            "The category was deleted. Select Re-read Categories to update the list.",
          ),
        ),
      ).toBeInTheDocument();
      await userEvent.click(
        within(dialog).getAllByRole("button", { name: "Close" }).at(-1) ??
          dialog,
      );
      expect(rows()).toHaveLength(1);
    });
  });
});
