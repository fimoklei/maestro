import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { CategoryMenu } from "./category-menu";

const NAMES = ["Code review", "Planning", "Release notes", "Writing"];

const renderMenu = (props: Partial<ComponentProps<typeof CategoryMenu>>) => {
  const handlers = {
    onPick: vi.fn(),
    onAdd: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <CategoryMenu
      label="Set category for tdd"
      names={NAMES}
      current={null}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

const optionNames = () =>
  screen
    .getAllByRole("option")
    .map((option) => option.textContent?.replace(/[✓+]/g, "").trim());

const search = () =>
  screen.getByRole("combobox", { name: "Search categories" });

describe("CategoryMenu", () => {
  it("opens on the search box, with No category and every category", () => {
    renderMenu({});

    expect(screen.getByRole("group", { name: "Set category for tdd" }));
    expect(search()).toHaveFocus();
    expect(optionNames()).toEqual(["No category", ...NAMES]);
  });

  it("lists the categories containing the typed text, ignoring case, and offers to add it", async () => {
    renderMenu({});

    await userEvent.type(search(), "  NOTE");

    expect(optionNames()).toEqual([
      "No category",
      "Release notes",
      "Add category NOTE",
    ]);
  });

  it("offers an existing category typed in other case, not a new one", async () => {
    renderMenu({});

    await userEvent.type(search(), "planning");

    expect(optionNames()).toEqual(["No category", "Planning"]);
  });

  it("shows No category and Add only on a Harness with no categories", async () => {
    renderMenu({ names: [] });

    expect(optionNames()).toEqual(["No category"]);
    await userEvent.type(search(), "Docs");

    expect(optionNames()).toEqual(["No category", "Add category Docs"]);
  });

  it("leaves out the excluded category", () => {
    renderMenu({ exclude: "Planning" });

    expect(optionNames()).toEqual([
      "No category",
      "Code review",
      "Release notes",
      "Writing",
    ]);
  });

  it("marks the current category", () => {
    renderMenu({ current: "Planning" });

    expect(
      screen.getByRole("option", { name: "Planning", selected: true }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("option", { selected: true })).toHaveLength(1);
  });

  it("marks No category where it is current", () => {
    renderMenu({ current: null });

    expect(screen.getByRole("option", { selected: true })).toHaveTextContent(
      "No category",
    );
  });

  it("marks nothing where several rows hold different categories", () => {
    renderMenu({ current: undefined });

    expect(screen.queryAllByRole("option", { selected: true })).toEqual([]);
  });

  it("picks a category, or none", async () => {
    const { onPick } = renderMenu({ current: "Planning" });

    await userEvent.click(screen.getByRole("option", { name: "Writing" }));
    await userEvent.click(screen.getByRole("option", { name: "No category" }));

    expect(onPick.mock.calls).toEqual([["Writing"], [null]]);
  });

  it("adds the trimmed typed name", async () => {
    const { onAdd, onPick } = renderMenu({});

    await userEvent.type(search(), "  Docs ");
    await userEvent.click(
      screen.getByRole("option", { name: "Add category Docs" }),
    );

    expect(onAdd).toHaveBeenCalledWith("Docs");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("picks from the keyboard, starting on Add once text is typed", async () => {
    const { onAdd, onPick } = renderMenu({});

    await userEvent.type(search(), "Plan{Enter}");
    expect(onAdd).toHaveBeenCalledWith("Plan");

    await userEvent.keyboard("{ArrowUp}{Enter}");
    expect(onPick).toHaveBeenCalledWith("Planning");
  });

  it("closes on Escape", async () => {
    const { onClose } = renderMenu({});

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("states a failure and keeps the menu open", () => {
    renderMenu({
      failure: {
        level: "error",
        label: "Category not set",
        message: "Try again.",
      },
    });

    const failure = screen.getByText("Category not set");
    expect(
      within(screen.getByRole("group")).getByText("Try again."),
    ).toBeInTheDocument();
    expect(failure).toBeInTheDocument();
  });
});
