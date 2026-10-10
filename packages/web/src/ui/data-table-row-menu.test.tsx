import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDataTableColumns, DataTable } from "./data-table";
import { RowMenu } from "./row-menu";

type Fruit = { name: string };

const fruits: Fruit[] = [
  { name: "pear" },
  { name: "apple" },
  { name: "cherry" },
];

const withMenu = (onSelect: () => void = () => {}) =>
  createDataTableColumns<Fruit>((helper) => [
    helper.accessor("name", { header: "Name", enableSorting: false }),
    helper.display({
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <RowMenu
          label={`Actions for ${row.original.name}`}
          items={[{ label: "Peel", movesFocus: false, onSelect }]}
          tabStop={false}
          busy={false}
        />
      ),
    }),
  ]);

const withoutMenu = createDataTableColumns<Fruit>((helper) => [
  helper.accessor("name", { header: "Name", enableSorting: false }),
]);

function renderTable(
  props: Partial<React.ComponentProps<typeof DataTable<Fruit>>> = {},
) {
  return render(
    <DataTable
      label="Fruit table"
      columns={withMenu()}
      data={fruits}
      getRowId={(fruit) => fruit.name}
      {...props}
    />,
  );
}

const grid = () => screen.getByRole("grid", { name: "Fruit table" });
const hint = () =>
  document.getElementById(grid().getAttribute("aria-describedby") ?? "");

function activeRowName() {
  const row = document.getElementById(
    grid().getAttribute("aria-activedescendant") ?? "",
  );
  return row === null
    ? null
    : (within(row).getAllByRole("gridcell")[0]?.textContent ?? null);
}

describe("DataTable — a row's ⋮ menu from the keyboard", () => {
  it.each([
    ["Shift+F10", "{Shift>}{F10}{/Shift}"],
    ["the context-menu key", "{ContextMenu}"],
  ])("opens the active row's menu on %s", async (_name, keys) => {
    renderTable();
    act(() => grid().focus());

    await userEvent.keyboard(`{ArrowDown}${keys}`);

    const menu = await screen.findByRole("menu", { name: "Actions for apple" });
    expect(within(menu).getByRole("menuitem", { name: "Peel" })).toBeVisible();
  });

  it("opens the active row's menu on a context-menu event at the table itself", async () => {
    renderTable();
    act(() => grid().focus());
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");

    fireEvent.contextMenu(grid());

    expect(
      await screen.findByRole("menu", { name: "Actions for cherry" }),
    ).toBeVisible();
  });

  it("returns focus to the table, on the same row, when the menu closes", async () => {
    renderTable();
    act(() => grid().focus());
    await userEvent.keyboard("{ArrowDown}{Shift>}{F10}{/Shift}");
    await screen.findByRole("menu");

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(grid()).toHaveFocus();
    expect(activeRowName()).toBe("apple");
  });

  it("returns focus to the table after an item runs", async () => {
    const onSelect = vi.fn();
    renderTable({ columns: withMenu(onSelect) });
    act(() => grid().focus());
    await userEvent.keyboard("{Shift>}{F10}{/Shift}");

    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Peel" }),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(grid()).toHaveFocus();
  });

  it("lands on the menu's first item", async () => {
    renderTable();
    act(() => grid().focus());

    await userEvent.keyboard("{Shift>}{F10}{/Shift}");

    expect(await screen.findByRole("menuitem", { name: "Peel" })).toHaveFocus();
  });

  it("leaves the key to a control inside the row", async () => {
    renderTable({
      selection: {
        label: "Pick",
        rowLabel: (fruit) => `Pick ${fruit.name}`,
        selected: new Set(),
        onToggle: () => {},
      },
    });
    screen.getByRole("checkbox", { name: "Pick pear" }).focus();

    await userEvent.keyboard("{Shift>}{F10}{/Shift}");

    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("DataTable — the keys it names", () => {
  const selection = (extra = {}) => ({
    label: "Pick",
    rowLabel: (fruit: Fruit) => `Pick ${fruit.name}`,
    selected: new Set<string>(),
    onToggle: () => {},
    ...extra,
  });

  it("describes itself with every key it answers to", () => {
    renderTable({ selection: selection({ onSetSelected: () => {} }) });

    expect(grid()).toHaveAccessibleDescription(
      "Space or X checks a row. Ctrl+A checks all rows. Shift+F10 opens the row menu.",
    );
  });

  it("names only the keys that do something here", () => {
    renderTable({ columns: withoutMenu, selection: selection() });
    expect(grid()).toHaveAccessibleDescription("Space or X checks a row.");
  });

  it("names no key where it has none to offer", () => {
    renderTable({ columns: withoutMenu });
    expect(grid()).not.toHaveAttribute("aria-describedby");
  });

  it("keeps the keys for a screen reader and never shows them", () => {
    renderTable();
    expect(hint()).toHaveClass("sr-only");

    act(() => grid().focus());

    expect(hint()).toHaveClass("sr-only");
  });
});
