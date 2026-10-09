import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { htmlElement } from "../test-utils";
import { createDataTableColumns } from "./data-table";
import { DetailPane } from "./detail-pane";
import { Dialog } from "./dialog";
import { TableScreen, type TableScreenProps } from "./table-screen";
import { type TableScreenState, useTableScreen } from "./use-table-screen";
import { useViewOptions } from "./use-view-options";

type Fruit = { name: string; colour: string };

const FRUIT: Fruit[] = [
  { name: "pear", colour: "green" },
  { name: "apple", colour: "red" },
  { name: "cherry", colour: "red" },
];

const COLUMNS = createDataTableColumns<Fruit>((helper) => [
  helper.accessor("name", { header: "Name" }),
  helper.accessor("colour", { header: "Colour" }),
]);

const NOT_READ = {
  level: "error",
  label: "Fruit not read",
  message: "Select Re-read Fruit to read the fruit again.",
} as const;

type ScreenProps = {
  reading?: boolean;
  settled?: boolean;
  failed?: boolean;
  rows?: Fruit[];
  onReread?: () => void;
  openOnArrival?: string | null;
  withPane?: boolean;
  onState?: (state: TableScreenState) => void;
} & Partial<
  Pick<
    TableScreenProps<Fruit>,
    | "shown"
    | "notice"
    | "groups"
    | "lead"
    | "freshness"
    | "rereading"
    | "firstReadRows"
    | "selection"
    | "selectionBar"
    | "columns"
    | "children"
  >
>;

function FruitScreen({
  reading = false,
  settled = true,
  failed = false,
  rows = FRUIT,
  onReread = () => {},
  openOnArrival = null,
  withPane = false,
  onState,
  ...rest
}: ScreenProps) {
  const state = useTableScreen({
    name: "Fruit",
    reading,
    settled,
    failure: failed ? NOT_READ : null,
    onReread,
    openOnArrival,
  });
  onState?.(state);
  return (
    <TableScreen
      state={state}
      action={<button type="button">Plant fruit</button>}
      rows={rows}
      columns={COLUMNS}
      rowId={(row) => row.name}
      rereading={false}
      firstReadRows={8}
      empty={{
        title: "No fruit yet",
        description: "The fruit you plant appears here.",
        action: <button type="button">Plant fruit</button>,
      }}
      pane={
        withPane
          ? (row, frame) => (
              <DetailPane
                title={row.name}
                activeKey={row.name}
                paragraph={[row.colour]}
                {...frame}
              />
            )
          : undefined
      }
      {...rest}
    />
  );
}

// The screen's own region; a notice carries a role of its own.
const region = () =>
  screen
    .getAllByRole("status")
    .find((each) => each.classList.contains("sr-only"));
const grid = () => screen.getByRole("grid", { name: "Fruit table" });
const reread = () => screen.getByRole("button", { name: "Re-read Fruit" });

afterEach(() => {
  vi.useRealTimers();
});

describe("TableScreen", () => {
  it("heads the panel with the screen name and its primary action, Re-read in band 2", async () => {
    const onReread = vi.fn();
    render(<FruitScreen onReread={onReread} />);

    const band1 = screen
      .getByRole("heading", { level: 1, name: "Fruit" })
      .closest("[data-band='1']") as HTMLElement;
    expect(
      within(band1).getByRole("button", { name: "Plant fruit" }),
    ).toBeInTheDocument();
    expect(reread().closest("[data-band='2']")).not.toBeNull();

    await userEvent.click(reread());

    expect(onReread).toHaveBeenCalledOnce();
    // A pressed re-read shows its skeleton at once, not after 1.3 s.
    expect(grid()).toHaveAttribute("aria-busy", "true");
    expect(within(grid()).queryByText("pear")).not.toBeInTheDocument();
  });

  it("puts the screen's facts and freshness line in band 2, before Re-read", () => {
    render(
      <FruitScreen
        lead={<dl aria-label="Orchard facts" />}
        freshness="Read 4 min ago"
      />,
    );

    const band2 = reread().closest("[data-band='2']") as HTMLElement;
    const facts = within(band2).getByLabelText("Orchard facts");
    const freshness = within(band2).getByText("Read 4 min ago");
    expect(
      facts.compareDocumentPosition(freshness) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      freshness.compareDocumentPosition(reread()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("spins Re-read while the screen re-reads", () => {
    const { rerender } = render(<FruitScreen rereading />);

    expect(reread()).toHaveAttribute("aria-busy", "true");
    rerender(<FruitScreen />);
    expect(reread()).not.toHaveAttribute("aria-busy");
  });

  it("lets a dismissed notice hand focus back to Re-read", () => {
    let state: TableScreenState | undefined;
    render(<FruitScreen onState={(each) => (state = each)} />);

    act(() => state?.rereadRef.current?.focus());

    expect(reread()).toHaveFocus();
  });

  it("hands rows a checkbox and floats the screen's selection bar under the table", async () => {
    const onToggle = vi.fn();
    render(
      <FruitScreen
        selection={{
          label: "Select fruit",
          allLabel: "Select all fruit",
          rowLabel: (row) => `Select ${row.name}`,
          selected: new Set(["pear"]),
          onToggle,
        }}
        selectionBar={<div role="toolbar" aria-label="1 fruit chosen" />}
      />,
    );

    await userEvent.click(
      within(grid()).getByRole("checkbox", { name: "Select apple" }),
    );

    expect(onToggle).toHaveBeenCalledWith(FRUIT[1]);
    expect(
      screen.getByRole("toolbar", { name: "1 fruit chosen" }),
    ).toBeInTheDocument();
  });

  describe("reads", () => {
    it("shows no skeleton for a read under 1.3 s, and says nothing of it", () => {
      vi.useFakeTimers();
      const { rerender } = render(<FruitScreen reading />);

      act(() => vi.advanceTimersByTime(1200));
      rerender(<FruitScreen />);
      act(() => vi.advanceTimersByTime(1000));

      expect(within(grid()).getByText("pear")).toBeInTheDocument();
      expect(region()).toBeEmptyDOMElement();
    });

    it("shows the skeleton past 1.3 s for at least 0.5 s, announcing both ends", () => {
      vi.useFakeTimers();
      const { rerender } = render(<FruitScreen reading />);

      act(() => vi.advanceTimersByTime(1300));
      expect(grid()).toHaveAttribute("aria-busy", "true");
      expect(region()).toHaveTextContent("Loading the Fruit…");

      rerender(<FruitScreen />);
      act(() => vi.advanceTimersByTime(499));
      expect(within(grid()).queryByText("pear")).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1));
      expect(within(grid()).getByText("pear")).toBeInTheDocument();
      expect(region()).toHaveTextContent("Fruit loaded.");
    });

    it("draws the screen's own skeleton count on a first read, a known count after", () => {
      vi.useFakeTimers();
      const { rerender } = render(
        <FruitScreen reading settled={false} rows={[]} firstReadRows={8} />,
      );

      act(() => vi.advanceTimersByTime(1300));
      // The header row plus the skeleton rows.
      expect(within(grid()).getAllByRole("row")).toHaveLength(9);

      rerender(<FruitScreen reading firstReadRows={8} />);
      expect(within(grid()).getAllByRole("row")).toHaveLength(4);
    });

    it("marks the table region busy while it reads, shown or not", () => {
      const { rerender } = render(<FruitScreen reading />);

      expect(grid().parentElement).toHaveAttribute("aria-busy", "true");
      rerender(<FruitScreen />);
      expect(grid().parentElement).not.toHaveAttribute("aria-busy");
    });

    it("states a failed read in one notice that re-reads, the rows kept, announced only by the notice", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const onReread = vi.fn();
      const { rerender } = render(<FruitScreen reading />);
      act(() => vi.advanceTimersByTime(1300));

      rerender(<FruitScreen failed settled={false} onReread={onReread} />);
      act(() => vi.advanceTimersByTime(500));

      expect(screen.getByText("Fruit not read")).toBeInTheDocument();
      expect(within(grid()).getByText("pear")).toBeInTheDocument();
      expect(region()).toBeEmptyDOMElement();
      const [, noticeAction] = screen.getAllByRole("button", {
        name: "Re-read Fruit",
      });
      await userEvent.click(noticeAction as HTMLElement);
      expect(onReread).toHaveBeenCalledOnce();
    });

    it("puts a screen-specific notice in place of the screen-wide one", () => {
      render(<FruitScreen failed notice={<p>Harness notices</p>} />);

      expect(screen.getByText("Harness notices")).toBeInTheDocument();
      expect(screen.queryByText("Fruit not read")).not.toBeInTheDocument();
    });

    it("states a read that answered with no rows as its empty state, with its action", () => {
      render(<FruitScreen rows={[]} />);

      expect(
        screen.getByRole("heading", { level: 2, name: "No fruit yet" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("The fruit you plant appears here."),
      ).toBeInTheDocument();
      expect(
        screen.getAllByRole("button", { name: "Plant fruit" }),
      ).toHaveLength(2);
      expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    });

    // An unread group is never drawn as empty.
    it("draws a group that has something to say in place of the empty state", () => {
      render(
        <FruitScreen
          rows={[]}
          groups={{
            key: (row) => row.colour,
            order: ["red"],
            message: () => "Red fruit was not read.",
          }}
        />,
      );

      expect(
        within(grid()).getByText("Red fruit was not read."),
      ).toBeInTheDocument();
      expect(screen.queryByText("No fruit yet")).not.toBeInTheDocument();
    });

    // One notice per band: the failure blocks most, so it stands alone.
    it("shows a failed read in place of the empty state", () => {
      render(<FruitScreen rows={[]} failed />);

      expect(screen.getByText("Fruit not read")).toBeInTheDocument();
      expect(screen.queryByText("No fruit yet")).not.toBeInTheDocument();
    });

    it("shows no empty state before a read answers", () => {
      render(<FruitScreen rows={[]} settled={false} reading />);

      expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    });
  });

  describe("writes", () => {
    it("says a reported write in the region until a newer read replaces it", () => {
      vi.useFakeTimers();
      let state: TableScreenState | undefined;
      const { rerender } = render(
        <FruitScreen onState={(each) => (state = each)} />,
      );

      act(() => state?.report("Planting…"));
      expect(region()).toHaveTextContent("Planting…");
      act(() => state?.report("Planted pear."));
      expect(region()).toHaveTextContent("Planted pear.");

      rerender(<FruitScreen reading onState={(each) => (state = each)} />);
      act(() => vi.advanceTimersByTime(1300));
      expect(region()).toHaveTextContent("Loading the Fruit…");
    });

    it("stays silent on a write reported as silence", () => {
      let state: TableScreenState | undefined;
      render(<FruitScreen onState={(each) => (state = each)} />);

      act(() => state?.report("Planting…"));
      act(() => state?.report(""));

      expect(region()).toBeEmptyDOMElement();
    });
  });

  describe("detail pane", () => {
    const pane = (name: string) =>
      screen.queryByRole("complementary", { name: `${name} detail` });

    it("opens the active row's pane on Enter", async () => {
      render(<FruitScreen withPane />);

      grid().focus();
      await userEvent.keyboard("{Enter}");

      expect(pane("pear")).toBeInTheDocument();
      expect(pane("pear")).toHaveTextContent("1 of 3");
    });

    it("opens the row a navigation asked for", () => {
      render(<FruitScreen withPane openOnArrival="cherry" />);

      expect(pane("cherry")).toBeInTheDocument();
    });

    it("pages in the table's order, not the rows' order", async () => {
      const groups = {
        key: (row: Fruit) => row.colour,
        order: ["red", "green"],
      };
      render(<FruitScreen withPane groups={groups} openOnArrival="cherry" />);

      // Grouped: apple, cherry, then pear.
      expect(pane("cherry")).toHaveTextContent("2 of 3");
      await userEvent.keyboard("{ArrowDown}");
      expect(pane("pear")).toHaveTextContent("3 of 3");
      await userEvent.keyboard("{ArrowUp}{ArrowUp}");
      expect(pane("apple")).toHaveTextContent("1 of 3");
    });

    it("keeps the pane open when the screen's narrowing hides its row", () => {
      const { rerender } = render(
        <FruitScreen withPane openOnArrival="apple" />,
      );

      rerender(
        <FruitScreen
          withPane
          openOnArrival="apple"
          shown={(row) => row.name !== "apple"}
        />,
      );

      expect(pane("apple")).toBeInTheDocument();
      expect(within(grid()).queryByText("apple")).not.toBeInTheDocument();
    });

    it("closes on Esc and returns focus to the table", async () => {
      render(<FruitScreen withPane />);
      grid().focus();
      await userEvent.keyboard("{Enter}");

      await userEvent.keyboard("{Escape}");

      expect(pane("pear")).not.toBeInTheDocument();
      expect(grid()).toHaveFocus();
    });

    it("closes on its ✕", async () => {
      render(<FruitScreen withPane openOnArrival="pear" />);

      await userEvent.click(
        screen.getByRole("button", { name: "Close pear detail" }),
      );

      expect(pane("pear")).not.toBeInTheDocument();
    });
  });

  describe("focus after a row leaves", () => {
    const PEELS = createDataTableColumns<Fruit>((helper) => [
      helper.accessor("name", { header: "Name" }),
      helper.display({
        id: "peel",
        header: "Peel",
        cell: ({ row }) => (
          <button type="button">Peel {row.original.name}</button>
        ),
      }),
    ]);
    const peel = (name: string) =>
      screen.getByRole("button", { name: `Peel ${name}` });
    const activeRow = () =>
      document.getElementById(
        grid().getAttribute("aria-activedescendant") ?? "",
      );

    it("lands on the next row", async () => {
      const { rerender } = render(<FruitScreen columns={PEELS} />);
      await userEvent.click(peel("pear"));

      rerender(<FruitScreen columns={PEELS} rows={FRUIT.slice(1)} />);

      expect(grid()).toHaveFocus();
      expect(activeRow()).toHaveTextContent("apple");
    });

    it("lands on the previous row when the last one leaves", async () => {
      const { rerender } = render(<FruitScreen columns={PEELS} />);
      await userEvent.click(peel("cherry"));

      rerender(<FruitScreen columns={PEELS} rows={FRUIT.slice(0, 2)} />);

      expect(grid()).toHaveFocus();
      expect(activeRow()).toHaveTextContent("apple");
    });

    it("lands on Re-read when no row is left", async () => {
      const { rerender } = render(
        <FruitScreen columns={PEELS} rows={FRUIT.slice(0, 1)} />,
      );
      await userEvent.click(peel("pear"));

      rerender(<FruitScreen columns={PEELS} rows={[]} />);

      expect(reread()).toHaveFocus();
    });

    it("leaves focus that stands elsewhere", async () => {
      const { rerender } = render(<FruitScreen columns={PEELS} />);
      await userEvent.click(peel("pear"));
      await userEvent.click(
        htmlElement(
          screen.getAllByRole("button", {
            name: "Plant fruit",
          })[0],
        ),
      );

      rerender(<FruitScreen columns={PEELS} rows={FRUIT.slice(1)} />);

      expect(
        screen.getAllByRole("button", { name: "Plant fruit" })[0],
      ).toHaveFocus();
    });

    it("lands on the next row when a dialog's opener left with its row", async () => {
      const dialog = (open: boolean) =>
        open ? (
          <Dialog
            title="Peel pear"
            version={null}
            width={480}
            phase="idle"
            action={null}
            failure={null}
            describedBy={null}
            fieldsChanged={false}
            onClose={() => {}}
          >
            {null}
          </Dialog>
        ) : null;
      const { rerender } = render(<FruitScreen columns={PEELS} />);
      await userEvent.click(peel("pear"));
      rerender(<FruitScreen columns={PEELS}>{dialog(true)}</FruitScreen>);
      await screen.findByRole("dialog");

      rerender(
        <FruitScreen columns={PEELS} rows={FRUIT.slice(1)}>
          {dialog(true)}
        </FruitScreen>,
      );
      rerender(
        <FruitScreen columns={PEELS} rows={FRUIT.slice(1)}>
          {dialog(false)}
        </FruitScreen>,
      );

      await waitFor(() => expect(grid()).toHaveFocus());
      expect(activeRow()).toHaveTextContent("apple");
    });
  });
});

type Plant = { name: string; kind: string; status: string | null };

const PLANTS: Plant[] = [
  { name: "oak", kind: "Tree", status: "Healthy" },
  { name: "ash", kind: "Tree", status: "Wilting" },
  { name: "box", kind: "Shrub", status: null },
];

const PLANT_COLUMNS = createDataTableColumns<Plant>((helper) => [
  helper.accessor("name", { header: "Name" }),
  helper.accessor("kind", { id: "kind", header: "Kind" }),
]);

function PlantScreen({ withPane = false }: { withPane?: boolean }) {
  const state = useTableScreen({
    name: "Garden",
    reading: false,
    settled: true,
    failure: null,
    onReread: () => {},
    openOnArrival: withPane ? "box" : null,
  });
  const view = useViewOptions(PLANTS, {
    kind: {
      label: "Kind",
      options: [
        { value: "Tree", label: "Trees" },
        { value: "Shrub", label: "Shrubs" },
      ],
      of: (row) => row.kind,
    },
    status: {
      words: ["Wilting", "Healthy"],
      of: (row) => row.status,
    },
    groupings: [
      { value: "kind", label: "Kind", groups: { key: (row) => row.kind } },
    ],
    initialGrouping: "none",
    columns: [{ value: "kind", label: "Kind" }],
  });
  return (
    <TableScreen
      state={state}
      rows={PLANTS}
      columns={PLANT_COLUMNS}
      rereading={false}
      firstReadRows={8}
      rowId={(row) => row.name}
      view={view}
      noMatch={{
        title: "No plants match the filters",
        description: "Select Filter to show more plants.",
      }}
      pane={
        withPane
          ? (row, frame) => (
              <DetailPane
                title={row.name}
                activeKey={row.name}
                paragraph={[row.kind]}
                {...frame}
              />
            )
          : undefined
      }
    />
  );
}

const garden = () => screen.getByRole("grid", { name: "Garden table" });
const lines = () =>
  within(garden())
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent);

async function choose(menu: RegExp, role: string, name: string) {
  await userEvent.click(screen.getByRole("button", { name: menu }));
  await userEvent.click(await screen.findByRole(role, { name }));
  await userEvent.keyboard("{Escape}");
}

describe("TableScreen view options", () => {
  it("puts Filter and Display beside Re-read in band 2", () => {
    render(<PlantScreen />);

    for (const name of ["Re-read Garden", "Filter", "Display"]) {
      expect(
        screen.getByRole("button", { name }).closest("[data-band='2']"),
      ).not.toBeNull();
    }
  });

  it("narrows the rows by status and counts the active filters on Filter", async () => {
    render(<PlantScreen />);

    await choose(/^Filter/, "menuitemcheckbox", "Wilting");

    expect(lines()).toEqual(["ashTree"]);
    expect(
      screen.getByRole("button", { name: "Filter, 1 active" }),
    ).toBeInTheDocument();
  });

  it("narrows the rows by kind, and says so when nothing matches", async () => {
    render(<PlantScreen />);

    await choose(/^Filter/, "menuitemradio", "Shrubs");
    expect(lines()).toEqual(["boxShrub"]);

    await choose(/^Filter/, "menuitemcheckbox", "Healthy");
    expect(
      screen.getByRole("button", { name: "Filter, 2 active" }),
    ).toBeInTheDocument();
    // The shared empty state, in place of the table.
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "No plants match the filters",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Select Filter to show more plants."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("groups by status worst first, an unread row last", async () => {
    render(<PlantScreen />);

    await choose(/^Display/, "menuitemradio", "Status");

    expect(lines()).toEqual([
      "Wilting 1",
      "ashTree",
      "Healthy 1",
      "oakTree",
      "Not read yet 1",
      "boxShrub",
    ]);
  });

  it("groups by the screen's own grouping", async () => {
    render(<PlantScreen />);

    await choose(/^Display/, "menuitemradio", "Kind");

    expect(lines()).toEqual([
      "Tree 2",
      "oakTree",
      "ashTree",
      "Shrub 1",
      "boxShrub",
    ]);
  });

  it("switches a column off and on from Display", async () => {
    render(<PlantScreen />);

    await choose(/^Display/, "menuitemcheckbox", "Kind");
    expect(
      within(garden()).queryByRole("columnheader", { name: /Kind/ }),
    ).not.toBeInTheDocument();

    await choose(/^Display/, "menuitemcheckbox", "Kind");
    expect(
      within(garden()).getByRole("columnheader", { name: /Kind/ }),
    ).toBeInTheDocument();
  });

  it("keeps the open pane when a filter hides its row", async () => {
    render(<PlantScreen withPane />);

    // By keyboard: a press outside the pane would close it.
    screen.getByRole("button", { name: "Filter" }).focus();
    await userEvent.keyboard("{Enter}{ArrowDown}{Enter}");

    expect(lines()).toEqual(["oakTree", "ashTree"]);

    expect(
      screen.getByRole("complementary", { name: "box detail" }),
    ).toBeInTheDocument();
  });
});
