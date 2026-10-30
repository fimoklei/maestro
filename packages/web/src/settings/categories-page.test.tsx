import type { CategoryList } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { CategoriesPage } from "./categories-page";

afterEach(() => {
  vi.unstubAllGlobals();
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

// The server keeps the list; an add answers the list as core sorts it.
function stubServer({
  categories = [],
  read,
  add,
}: {
  categories?: Category[];
  read?: () => Answer;
  add?: (name: string) => Answer;
} = {}) {
  let saved = categories;
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
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

  it("re-reads the categories from the notice after a failed read", async () => {
    let fail = true;
    stubServer({
      categories: [category("Planning")],
      read: () =>
        fail
          ? Promise.reject(new TypeError("offline"))
          : jsonResponse(list([category("Planning")])),
    });
    renderPage();

    const reread = await screen.findByRole("button", {
      name: "Re-read Categories",
    });
    fail = false;
    await userEvent.click(reread);

    expect(await screen.findByText("Planning")).toBeInTheDocument();
  });
});
