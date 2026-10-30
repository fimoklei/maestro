import type { InventoryPrimitive } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  categoryFact,
  categoryMenu,
  statusRegion,
  stubCategoryServer,
} from "../categories/category-server-test-helpers";
import { renderWithQuery } from "../test-utils";
import { ToastHost } from "../ui/toast";
import { PromptsPanel } from "./prompts-panel";

// Set category on Prompts: the pane's Category fact, the row's ⋮, the pane's
// foot and the selection bar, over a stubbed server that keeps its own list.

afterEach(() => {
  vi.unstubAllGlobals();
});

const prompt = (name: string) =>
  ({
    type: "prompt",
    name,
    description: `${name} description`,
    path: `.maestro/prompts/${name}.md`,
    pendingRelease: null,
    text: "Do the thing.",
    nameValid: true,
  }) satisfies InventoryPrimitive;

const PROMPTS = [prompt("standup"), prompt("pr-review"), prompt("release")];

const stubServer = (
  options: Omit<Parameters<typeof stubCategoryServer>[0], "primitives"> = {},
) => stubCategoryServer({ primitives: PROMPTS, ...options });

function renderPanel() {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/inventory/prompts"]}>
      <PromptsPanel />
      <ToastHost />
    </MemoryRouter>,
  );
}

async function openPane(name: string) {
  await userEvent.click(await screen.findByRole("gridcell", { name }));
  return within(await screen.findByRole("complementary"));
}

describe("Set category on Prompts", () => {
  it("shows each prompt's category in the pane, or No category", async () => {
    stubServer({
      assignments: [{ type: "prompt", name: "standup", category: "Planning" }],
    });
    renderPanel();

    const standup = await openPane("standup");
    await waitFor(() =>
      expect(categoryFact(standup)).toHaveTextContent("Planning"),
    );
    const review = await openPane("pr-review");
    expect(categoryFact(review)).toHaveTextContent("No category");
  });

  it("puts Set category in the pane's foot after Edit prompt, never behind ⋯", async () => {
    stubServer();
    renderPanel();

    const pane = await openPane("standup");
    const foot = await pane.findByRole("button", { name: "Set category" });

    const buttons = pane
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(buttons.indexOf("Set category")).toBe(
      buttons.indexOf("Edit prompt") + 1,
    );
    expect(foot).toHaveAttribute("aria-expanded", "false");
  });

  it("sets a category from the pane's foot and says so in the status region", async () => {
    const posts = stubServer({
      assignments: [{ type: "prompt", name: "standup", category: "Writing" }],
    });
    renderPanel();
    const pane = await openPane("standup");

    await userEvent.click(
      await pane.findByRole("button", { name: "Set category" }),
    );
    const picker = categoryMenu("Set category for standup");
    expect(
      picker.getByRole("option", { name: "Writing", selected: true }),
    ).toBeInTheDocument();
    await userEvent.click(picker.getByRole("option", { name: "Planning" }));

    expect(posts).toEqual([
      {
        url: "/api/categories/assign",
        body: {
          items: [{ type: "prompt", name: "standup" }],
          category: "Planning",
        },
      },
    ]);
    await waitFor(() =>
      expect(categoryFact(pane)).toHaveTextContent("Planning"),
    );
    await waitFor(() =>
      expect(statusRegion()).toHaveTextContent("Set category for standup."),
    );
    expect(pane.getByRole("button", { name: "Set category" })).toHaveFocus();
  });

  it("reaches Set category from the row's ⋮ by keyboard", async () => {
    stubServer();
    renderPanel();
    const row = (
      await screen.findByRole("gridcell", { name: "standup" })
    ).closest("tr");

    await userEvent.click(
      within(row as HTMLElement).getByRole("button", {
        name: "Actions for standup",
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
      screen.queryByRole("group", { name: "Set category for standup" }),
    ).toBeNull();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("writes nothing to the Harness", async () => {
    const posts = stubServer();
    renderPanel();
    const pane = await openPane("standup");

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
    expect(posts.map((post) => post.url)).toEqual([
      "/api/categories",
      "/api/categories/assign",
    ]);
  });

  describe("the selection bar", () => {
    async function select(...names: string[]) {
      for (const name of names) {
        await userEvent.click(
          await screen.findByRole("checkbox", { name: `Select ${name}` }),
        );
      }
    }

    it("holds Set category only", async () => {
      stubServer();
      renderPanel();
      await select("standup");

      const bar = within(screen.getByRole("group", { name: "1 selected" }));
      expect(
        bar.getAllByRole("button").map((button) => button.textContent),
      ).toEqual(["Set category", ""]);
      expect(
        bar.getByRole("button", { name: "Clear selection" }),
      ).toBeInTheDocument();
    });

    it("sets one category on every selected prompt, says so in a toast and clears the selection", async () => {
      const posts = stubServer();
      renderPanel();
      await select("standup", "pr-review");

      await userEvent.click(
        screen.getByRole("button", { name: "Set category" }),
      );
      await userEvent.click(
        categoryMenu("Set category for 2 prompts").getByRole("option", {
          name: "Writing",
        }),
      );

      expect(posts.at(-1)?.body).toEqual({
        items: [
          { type: "prompt", name: "standup" },
          { type: "prompt", name: "pr-review" },
        ],
        category: "Writing",
      });
      expect(
        await screen.findByText("Set category for 2 prompts."),
      ).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText("2 selected")).toBeNull());
      expect(
        screen.getByRole("checkbox", { name: "Select standup" }),
      ).not.toBeChecked();
      expect(screen.getByRole("grid")).toHaveFocus();
    });

    it("marks the shared category, and nothing where the selected prompts differ", async () => {
      stubServer({
        assignments: [
          { type: "prompt", name: "standup", category: "Writing" },
          { type: "prompt", name: "pr-review", category: "Writing" },
          { type: "prompt", name: "release", category: "Planning" },
        ],
      });
      renderPanel();
      await select("standup", "pr-review");

      await userEvent.click(
        screen.getByRole("button", { name: "Set category" }),
      );
      expect(
        categoryMenu("Set category for 2 prompts").getByRole("option", {
          name: "Writing",
          selected: true,
        }),
      ).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");

      await select("release");
      await userEvent.click(
        screen.getByRole("button", { name: "Set category" }),
      );
      expect(
        categoryMenu("Set category for 3 prompts").queryAllByRole("option", {
          selected: true,
        }),
      ).toEqual([]);
    });
  });
});
