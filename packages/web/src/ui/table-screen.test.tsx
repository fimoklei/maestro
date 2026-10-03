import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDataTableColumns } from "./data-table";
import { DetailPane } from "./detail-pane";
import { TableScreen, type TableScreenProps } from "./table-screen";
import { type TableScreenState, useTableScreen } from "./use-table-screen";

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
} & Partial<Pick<TableScreenProps<Fruit>, "shown" | "notice" | "groups">>;

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
      empty={{
        title: "No fruit yet",
        description: "The fruit you plant appears here.",
        action: <button type="button">Plant fruit</button>,
      }}
      pane={
        withPane
          ? (row, frame) => (
              <DetailPane title={row.name} activeKey={row.name} {...frame}>
                <p>{row.colour}</p>
              </DetailPane>
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
});
