import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createPortal } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import {
  createDataTableColumns,
  DataTable,
  useDataTableRowActive,
} from "./data-table";

type Fruit = { name: string; colour: string };

const fruits: Fruit[] = [
  { name: "pear", colour: "green" },
  { name: "apple", colour: "red" },
  { name: "cherry", colour: "dark red" },
];

const columns = createDataTableColumns<Fruit>((helper) => [
  helper.accessor("name", { header: "Name", enableSorting: true }),
  helper.accessor("colour", { header: "Colour", enableSorting: false }),
]);

function renderTable(
  props: Partial<React.ComponentProps<typeof DataTable<Fruit>>> = {},
) {
  return render(
    <>
      <button type="button">Before</button>
      <DataTable
        label="Fruit table"
        columns={columns}
        data={fruits}
        getRowId={(fruit) => fruit.name}
        selection={{
          label: "Pick",
          rowLabel: (fruit) => `Pick ${fruit.name}`,
          selected: new Set(),
          onToggle: () => {},
        }}
        {...props}
      />
      <button type="button">After</button>
    </>,
  );
}

const grid = () => screen.getByRole("grid", { name: "Fruit table" });

function activeRowName(): string | null {
  const id = grid().getAttribute("aria-activedescendant");
  if (id === null) return null;
  const row = document.getElementById(id);
  return row === null
    ? null
    : (within(row).getAllByRole("gridcell")[1]?.textContent ?? null);
}

function bodyNames(): string[] {
  const [, ...rows] = within(grid()).getAllByRole("row");
  return rows.map(
    (row) => within(row).getAllByRole("gridcell")[1]?.textContent ?? "",
  );
}

describe("DataTable", () => {
  it("renders a named grid with one row per item under its column headers", () => {
    renderTable();

    expect(
      within(grid()).getByRole("columnheader", { name: /name/i }),
    ).toBeInTheDocument();
    expect(bodyNames()).toEqual(["pear", "apple", "cherry"]);
  });

  it("is one Tab stop: the rows' own controls are reached with the arrows", async () => {
    renderTable();

    await userEvent.click(screen.getByRole("button", { name: "Before" }));
    await userEvent.tab();
    expect(grid()).toHaveFocus();

    await userEvent.tab();
    // Past the sortable Name header, the next stop leaves the table.
    expect(within(grid()).getByRole("button", { name: /name/i })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("moves the active row with the arrow keys, Home and End", async () => {
    renderTable();
    act(() => grid().focus());

    expect(activeRowName()).toBe("pear");
    await userEvent.keyboard("{ArrowDown}");
    expect(activeRowName()).toBe("apple");
    await userEvent.keyboard("{End}");
    expect(activeRowName()).toBe("cherry");
    await userEvent.keyboard("{ArrowDown}");
    expect(activeRowName()).toBe("cherry");
    await userEvent.keyboard("{Home}");
    expect(activeRowName()).toBe("pear");
  });

  it("opens the active row on Enter", async () => {
    const onRowOpen = vi.fn();
    renderTable({ onRowOpen });
    act(() => grid().focus());

    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onRowOpen).toHaveBeenCalledWith(fruits[1]);
  });

  it("opens a row on a click anywhere in it, but not on a click on its own control", async () => {
    const onRowOpen = vi.fn();
    renderTable({ onRowOpen });

    await userEvent.click(screen.getByRole("gridcell", { name: "red" }));
    expect(onRowOpen).toHaveBeenCalledWith(fruits[1]);

    await userEvent.click(screen.getByRole("checkbox", { name: "Pick pear" }));
    expect(onRowOpen).toHaveBeenCalledTimes(1);
  });

  it("toggles the active row on Space, and a row from its checkbox", async () => {
    const onToggle = vi.fn();
    renderTable({
      selection: {
        label: "Pick",
        rowLabel: (fruit) => `Pick ${fruit.name}`,
        selected: new Set(),
        onToggle,
      },
    });
    act(() => grid().focus());

    await userEvent.keyboard(" ");
    expect(onToggle).toHaveBeenCalledWith(fruits[0]);

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Pick cherry" }),
    );
    expect(onToggle).toHaveBeenLastCalledWith(fruits[2]);
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("marks the chosen rows as selected", () => {
    renderTable({
      selection: {
        label: "Pick",
        rowLabel: (fruit) => `Pick ${fruit.name}`,
        selected: new Set(["apple"]),
        onToggle: () => {},
      },
    });

    const [, pear, apple] = within(grid()).getAllByRole("row");
    expect(apple).toHaveAttribute("aria-selected", "true");
    expect(pear).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("checkbox", { name: "Pick apple" })).toBeChecked();
  });

  it("selects every shown row from the header, and clears them once all are chosen", async () => {
    const onSetSelected = vi.fn();
    const selection = {
      label: "Pick",
      allLabel: "Pick all",
      rowLabel: (fruit: Fruit) => `Pick ${fruit.name}`,
      onToggle: () => {},
      onSetSelected,
    };
    const { rerender } = render(
      <DataTable
        label="Fruit table"
        columns={columns}
        data={fruits}
        getRowId={(fruit) => fruit.name}
        selection={{ ...selection, selected: new Set(["apple"]) }}
      />,
    );

    const all = screen.getByRole("checkbox", { name: "Pick all" });
    expect(all).toHaveAttribute("aria-checked", "mixed");
    await userEvent.click(all);
    expect(onSetSelected).toHaveBeenLastCalledWith(fruits, true);

    rerender(
      <DataTable
        label="Fruit table"
        columns={columns}
        data={fruits}
        getRowId={(fruit) => fruit.name}
        selection={{
          ...selection,
          selected: new Set(fruits.map((fruit) => fruit.name)),
        }}
      />,
    );
    expect(all).toBeChecked();
    await userEvent.click(all);
    expect(onSetSelected).toHaveBeenLastCalledWith(fruits, false);
  });

  it("selects every shown row with Control or Command plus A", async () => {
    const onSetSelected = vi.fn();
    renderTable({
      selection: {
        label: "Pick",
        allLabel: "Pick all",
        rowLabel: (fruit) => `Pick ${fruit.name}`,
        selected: new Set(),
        onToggle: () => {},
        onSetSelected,
      },
    });
    act(() => grid().focus());

    await userEvent.keyboard("{Control>}a{/Control}");
    expect(onSetSelected).toHaveBeenLastCalledWith(fruits, true);
    await userEvent.keyboard("{Meta>}a{/Meta}");
    expect(onSetSelected).toHaveBeenCalledTimes(2);
  });

  it("toggles the active row with X, as with Space", async () => {
    const onToggle = vi.fn();
    renderTable({
      selection: {
        label: "Pick",
        rowLabel: (fruit) => `Pick ${fruit.name}`,
        selected: new Set(),
        onToggle,
      },
    });
    act(() => grid().focus());

    await userEvent.keyboard("{ArrowDown}x");
    expect(onToggle).toHaveBeenCalledWith(fruits[1]);
  });

  it("selects a range with Shift, from the last row toggled", async () => {
    const onToggle = vi.fn();
    const onSetSelected = vi.fn();
    // One session, so the held Shift carries into the next click.
    const user = userEvent.setup();
    renderTable({
      selection: {
        label: "Pick",
        rowLabel: (fruit) => `Pick ${fruit.name}`,
        selected: new Set(),
        onToggle,
        onSetSelected,
      },
    });

    await user.click(screen.getByRole("checkbox", { name: "Pick pear" }));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByRole("checkbox", { name: "Pick cherry" }));
    await user.keyboard("{/Shift}");

    expect(onSetSelected).toHaveBeenCalledWith(fruits, true);
    expect(onToggle).toHaveBeenCalledTimes(1);

    act(() => grid().focus());
    await user.keyboard("{Home}{Shift>}{ArrowDown} {/Shift}");
    expect(onSetSelected).toHaveBeenLastCalledWith(
      [fruits[1], fruits[2]],
      true,
    );
  });

  it("keeps the loaded order until a header is pressed, then sorts both ways", async () => {
    renderTable();
    const header = within(grid()).getByRole("columnheader", { name: /name/i });

    expect(header).toHaveAttribute("aria-sort", "none");
    await userEvent.click(within(header).getByRole("button"));
    expect(bodyNames()).toEqual(["apple", "cherry", "pear"]);
    expect(header).toHaveAttribute("aria-sort", "ascending");

    await userEvent.click(within(header).getByRole("button"));
    expect(bodyNames()).toEqual(["pear", "cherry", "apple"]);
    expect(header).toHaveAttribute("aria-sort", "descending");
  });

  it("hides a column the reader switched off", () => {
    renderTable({ columnVisibility: { colour: false } });

    expect(
      within(grid()).queryByRole("columnheader", { name: "Colour" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("gridcell", { name: "red" }),
    ).not.toBeInTheDocument();
  });

  it("draws skeleton rows in place of the data while loading, and says it is busy", () => {
    renderTable({ loading: true, skeletonRows: 4 });

    expect(grid()).toHaveAttribute("aria-busy", "true");
    expect(within(grid()).getAllByRole("row")).toHaveLength(5);
    expect(screen.queryByText("pear")).not.toBeInTheDocument();
  });

  it("shows its empty message in place of rows", () => {
    renderTable({ data: [], empty: "Nothing grows here." });

    expect(screen.getByText("Nothing grows here.")).toBeInTheDocument();
  });

  it("puts rows under a header per group, naming the group and its count", () => {
    renderTable({
      groups: {
        key: (fruit) => (fruit.colour.includes("red") ? "Red" : "Green"),
        order: ["Red", "Green"],
      },
    });

    const [, redHeader, apple, cherry, greenHeader, pear] = within(
      grid(),
    ).getAllByRole("row");
    expect(redHeader).toHaveTextContent("Red 2");
    expect(greenHeader).toHaveTextContent("Green 1");
    expect(apple).toHaveTextContent("apple");
    expect(cherry).toHaveTextContent("cherry");
    expect(pear).toHaveTextContent("pear");
  });

  it("moves the active row across a group header without stopping on it", async () => {
    renderTable({
      groups: {
        key: (fruit) => (fruit.colour.includes("red") ? "Red" : "Green"),
        order: ["Red", "Green"],
      },
    });
    act(() => grid().focus());

    expect(activeRowName()).toBe("apple");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(activeRowName()).toBe("pear");
  });

  it("reports the rows in the order it shows them, after a sort", async () => {
    const onRowOrderChange = vi.fn();
    renderTable({ onRowOrderChange });

    expect(onRowOrderChange).toHaveBeenLastCalledWith([
      "pear",
      "apple",
      "cherry",
    ]);

    await userEvent.click(
      within(
        within(grid()).getByRole("columnheader", { name: /name/i }),
      ).getByRole("button"),
    );

    expect(onRowOrderChange).toHaveBeenLastCalledWith([
      "apple",
      "cherry",
      "pear",
    ]);
  });

  it("moves its active row to the row opened from outside", () => {
    const { rerender } = renderTable({ openRowId: null });

    rerender(
      <DataTable
        label="Fruit table"
        columns={columns}
        data={fruits}
        getRowId={(fruit) => fruit.name}
        selection={{
          label: "Pick",
          rowLabel: (fruit) => `Pick ${fruit.name}`,
          selected: new Set(),
          onToggle: () => {},
        }}
        openRowId="cherry"
      />,
    );
    act(() => grid().focus());

    expect(activeRowName()).toBe("cherry");
  });

  it("tells a cell whether its row is the active one while the grid holds focus", async () => {
    function Marker() {
      return useDataTableRowActive() ? "active" : "idle";
    }
    const marked = createDataTableColumns<Fruit>((helper) => [
      helper.accessor("name", { header: "Name" }),
      helper.display({ id: "mark", header: "Mark", cell: () => <Marker /> }),
    ]);
    render(
      <DataTable
        label="Fruit table"
        columns={marked}
        data={fruits}
        getRowId={(fruit) => fruit.name}
      />,
    );

    expect(screen.queryByText("active")).toBeNull();
    act(() => grid().focus());
    expect(screen.getAllByText("active")).toHaveLength(1);
    await userEvent.keyboard("{ArrowDown}");
    expect(
      within(within(grid()).getAllByRole("row")[2] as HTMLElement).getByText(
        "active",
      ),
    ).toBeInTheDocument();
  });

  it("ignores a click or a key from a menu a cell opened outside the table", async () => {
    // React bubbles a portal's events through the cell that rendered it.
    const onRowOpen = vi.fn();
    const withPortal = createDataTableColumns<Fruit>((helper) => [
      helper.accessor("name", { header: "Name" }),
      helper.display({
        id: "menu",
        header: "Menu",
        cell: ({ row }) =>
          createPortal(
            <div role="menu" tabIndex={-1} aria-label={`${row.id} menu`}>
              {row.id} item
            </div>,
            document.body,
          ),
      }),
    ]);
    render(
      <DataTable
        label="Fruit table"
        columns={withPortal}
        data={fruits}
        getRowId={(fruit) => fruit.name}
        onRowOpen={onRowOpen}
      />,
    );

    await userEvent.click(screen.getByText("apple item"));
    act(() => screen.getByRole("menu", { name: "apple menu" }).focus());
    await userEvent.keyboard("{Enter}");

    expect(onRowOpen).not.toHaveBeenCalled();
  });
});
