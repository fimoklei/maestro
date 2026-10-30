import type { CategoryList } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { ToastHost } from "../ui/toast";
import { SkillsPanel } from "./skills-panel";

// Set category on Skills: the pane's Category fact, the row's ⋮, the pane's
// foot and the selection bar, over a stubbed server that keeps its own list.

afterEach(() => {
  vi.unstubAllGlobals();
});

type Assignment = CategoryList["assignments"][number];

const skill = (name: string) => ({
  type: "skill",
  name,
  description: `${name} description`,
  pendingRelease: null,
});

const listOf = (names: string[], assignments: Assignment[]): CategoryList => ({
  categories: names.map((name) => ({
    name,
    skills: assignments.filter((each) => each.category === name).length,
    prompts: 0,
  })),
  assignments,
});

// The server's list, which every write answers in whole.
function stubServer({
  names = ["Planning", "Writing"],
  assignments = [],
  assign,
}: {
  names?: string[];
  assignments?: Assignment[];
  assign?: () => Response;
} = {}) {
  const state = { names: [...names], assignments: [...assignments] };
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push({ url, body });
        if (url === "/api/categories/assign") {
          if (assign) return assign();
          const keys = new Set(body.items.map((item: Assignment) => item.name));
          state.assignments = [
            ...state.assignments.filter((each) => !keys.has(each.name)),
            ...(body.category === null
              ? []
              : body.items.map((item: Assignment) => ({
                  ...item,
                  category: body.category,
                }))),
          ];
          return jsonResponse(listOf(state.names, state.assignments));
        }
        if (url === "/api/categories") {
          state.names = [...state.names, body.name].sort();
          return jsonResponse({
            ...listOf(state.names, state.assignments),
            added: body.name,
          });
        }
      }
      if (url === "/api/categories") {
        return jsonResponse(listOf(state.names, state.assignments));
      }
      if (url.startsWith("/api/registry")) return jsonResponse({ repos: [] });
      if (url.startsWith("/api/deploy-state")) {
        return jsonResponse({ primitives: [], skipped: [] });
      }
      if (url.startsWith("/api/harness")) {
        return jsonResponse({ error: "not-configured" }, 409);
      }
      return jsonResponse({
        primitives: [skill("tdd"), skill("grill"), skill("research")],
        unreadTypes: [],
      });
    }),
  );
  return posts;
}

function renderPanel() {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/inventory/skills"]}>
      <SkillsPanel />
      <ToastHost />
    </MemoryRouter>,
  );
}

async function openPane(name: string) {
  await userEvent.click(await screen.findByRole("gridcell", { name }));
  return within(await screen.findByRole("complementary"));
}

const categoryFact = (pane: ReturnType<typeof within>) =>
  pane.getByText("Category", { selector: "dt" }).nextElementSibling;

// The screen's own region; a notice carries a role of its own.
const region = () => {
  const found = screen
    .getAllByRole("status")
    .find((each) => each.classList.contains("sr-only"));
  if (found === undefined) throw new Error("no status region");
  return found;
};

const menu = (name: string) => within(screen.getByRole("group", { name }));

describe("Set category on Skills", () => {
  it("shows each skill's category in the pane, or No category", async () => {
    stubServer({
      assignments: [{ type: "skill", name: "tdd", category: "Planning" }],
    });
    renderPanel();

    const tdd = await openPane("tdd");
    await waitFor(() =>
      expect(categoryFact(tdd)).toHaveTextContent("Planning"),
    );
    const grill = await openPane("grill");
    expect(categoryFact(grill)).toHaveTextContent("No category");
  });

  it("puts Set category in the pane's foot after Deploy skill, never behind ⋯", async () => {
    stubServer();
    renderPanel();

    const pane = await openPane("tdd");
    const foot = await pane.findByRole("button", { name: "Set category" });

    const buttons = pane
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(buttons.indexOf("Set category")).toBe(
      buttons.indexOf("Deploy skill") + 1,
    );
    expect(foot).toHaveAttribute("aria-expanded", "false");
  });

  it("sets a category from the pane's foot and says so in the status region", async () => {
    const posts = stubServer({
      assignments: [{ type: "skill", name: "tdd", category: "Writing" }],
    });
    renderPanel();
    const pane = await openPane("tdd");

    await userEvent.click(
      await pane.findByRole("button", { name: "Set category" }),
    );
    const picker = menu("Set category for tdd");
    expect(
      picker.getByRole("option", { name: "Writing", selected: true }),
    ).toBeInTheDocument();
    await userEvent.click(picker.getByRole("option", { name: "Planning" }));

    expect(posts).toEqual([
      {
        url: "/api/categories/assign",
        body: { items: [{ type: "skill", name: "tdd" }], category: "Planning" },
      },
    ]);
    await waitFor(() =>
      expect(categoryFact(pane)).toHaveTextContent("Planning"),
    );
    await waitFor(() =>
      expect(region()).toHaveTextContent("Set category for tdd."),
    );
    expect(
      screen.queryByRole("group", { name: "Set category for tdd" }),
    ).toBeNull();
    expect(pane.getByRole("button", { name: "Set category" })).toHaveFocus();
  });

  it("reaches Set category from the row's ⋮ by keyboard", async () => {
    stubServer();
    renderPanel();
    const row = (await screen.findByRole("gridcell", { name: "tdd" })).closest(
      "tr",
    );

    await userEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "Actions for tdd",
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Set category" }),
    );

    const search = await screen.findByRole("combobox", {
      name: "Search categories",
    });
    await waitFor(() => expect(search).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    expect(
      screen.queryByRole("group", { name: "Set category for tdd" }),
    ).toBeNull();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("adds a typed category at once and gives it to the skill", async () => {
    const posts = stubServer();
    renderPanel();
    const pane = await openPane("tdd");

    await userEvent.click(
      await pane.findByRole("button", { name: "Set category" }),
    );
    await userEvent.type(
      screen.getByRole("combobox", { name: "Search categories" }),
      "Docs",
    );
    await userEvent.click(
      screen.getByRole("option", { name: "Add category Docs" }),
    );

    await waitFor(() => expect(categoryFact(pane)).toHaveTextContent("Docs"));
    expect(posts.map((post) => post.body)).toEqual([
      { name: "Docs" },
      { items: [{ type: "skill", name: "tdd" }], category: "Docs" },
    ]);
  });

  it("removes a category with No category", async () => {
    const posts = stubServer({
      assignments: [{ type: "skill", name: "tdd", category: "Writing" }],
    });
    renderPanel();
    const pane = await openPane("tdd");

    await userEvent.click(
      await pane.findByRole("button", { name: "Set category" }),
    );
    await userEvent.click(screen.getByRole("option", { name: "No category" }));

    await waitFor(() =>
      expect(categoryFact(pane)).toHaveTextContent("No category"),
    );
    expect(posts.at(-1)?.body).toEqual({
      items: [{ type: "skill", name: "tdd" }],
      category: null,
    });
  });

  it("keeps the menu open with the refusal when the Harness no longer holds the skill", async () => {
    stubServer({
      assign: () => jsonResponse({ error: "item-not-found" }, 404),
    });
    renderPanel();
    const pane = await openPane("tdd");

    await userEvent.click(
      await pane.findByRole("button", { name: "Set category" }),
    );
    await userEvent.click(screen.getByRole("option", { name: "Planning" }));

    const picker = menu("Set category for tdd");
    expect(await picker.findByText("Category not set")).toBeInTheDocument();
    expect(categoryFact(pane)).toHaveTextContent("No category");
  });

  describe("the selection bar", () => {
    async function select(...names: string[]) {
      for (const name of names) {
        await userEvent.click(
          await screen.findByRole("checkbox", {
            name: `Select ${name} for bulk deploy`,
          }),
        );
      }
    }

    it("sets one category on every selected skill and says so in a toast", async () => {
      const posts = stubServer();
      renderPanel();
      await select("tdd", "grill");

      await userEvent.click(
        screen.getByRole("button", { name: "Set category" }),
      );
      await userEvent.click(
        menu("Set category for 2 skills").getByRole("option", {
          name: "Writing",
        }),
      );

      expect(posts.at(-1)?.body).toEqual({
        items: [
          { type: "skill", name: "tdd" },
          { type: "skill", name: "grill" },
        ],
        category: "Writing",
      });
      expect(
        await screen.findByText("Set category for 2 skills."),
      ).toBeInTheDocument();
    });

    it("marks the shared category, and nothing where the selected skills differ", async () => {
      stubServer({
        assignments: [
          { type: "skill", name: "tdd", category: "Writing" },
          { type: "skill", name: "grill", category: "Writing" },
          { type: "skill", name: "research", category: "Planning" },
        ],
      });
      renderPanel();
      await select("tdd", "grill");

      await userEvent.click(
        screen.getByRole("button", { name: "Set category" }),
      );
      expect(
        menu("Set category for 2 skills").getByRole("option", {
          name: "Writing",
          selected: true,
        }),
      ).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");

      await select("research");
      await userEvent.click(
        screen.getByRole("button", { name: "Set category" }),
      );
      expect(
        menu("Set category for 3 skills").queryAllByRole("option", {
          selected: true,
        }),
      ).toEqual([]);
    });
  });
});
