import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectVisibleCause } from "../test-utils";
import type { Band } from "./band";
import { createDataTableColumns, type RowGroups } from "./data-table";
import { TableScreen } from "./table-screen";
import { useTableScreen } from "./use-table-screen";
import { useViewOptions } from "./use-view-options";

type Plant = { name: string; place: string };

const COLUMNS = createDataTableColumns<Plant>((helper) => [
  helper.accessor("name", { header: "Name" }),
  helper.accessor("place", { id: "place", header: "Place" }),
]);

const band = (outcome: "fetched" | null): Band => ({
  summary: {
    freshness: {
      readAt: outcome === null ? [] : [Date.now() - 60_000],
      outcome,
    },
    healthy: "Thriving",
    counts: [],
  },
  facts: [],
  labelsBelowRem: 0,
  countsBelowRem: 0,
});

const PLACES: RowGroups<Plant> = {
  key: (row) => row.place,
  order: ["Beds", "Pots"],
  message: (key) =>
    key === "Beds" ? "No beds are dug yet." : "No pots are bought yet.",
};

// A garden whose read left no plant: Filter and Display have nothing to work on.
function EmptyGarden({
  settled = true,
  failed = false,
  reading = false,
  groups,
}: {
  settled?: boolean;
  failed?: boolean;
  reading?: boolean;
  groups?: RowGroups<Plant>;
}) {
  const state = useTableScreen({
    name: "Garden",
    reading,
    settled,
    failure: failed
      ? {
          level: "error",
          label: "Garden not read",
          message: "Select Re-read Garden to read the garden again.",
        }
      : null,
    onReread: () => {},
    openOnArrival: null,
  });
  const view = useViewOptions<Plant>([], {
    kind: null,
    status: null,
    groupings:
      groups === undefined ? [] : [{ value: "place", label: "Place", groups }],
    initialGrouping: groups === undefined ? "none" : "place",
    columns: [{ value: "place", label: "Place" }],
  });
  return (
    <TableScreen
      state={state}
      band={band(settled || failed ? "fetched" : null)}
      rows={[]}
      columns={COLUMNS}
      rowId={(row) => row.name}
      rereading={false}
      firstReadRows={8}
      view={view}
      empty={{
        title: "No plants yet",
        description: "The plants you sow appear here.",
      }}
    />
  );
}

const menus = () =>
  ["Filter", "Display"].map((name) => screen.getByRole("button", { name }));

describe("TableScreen Filter and Display on a screen with no rows", () => {
  it("point to the failed-read notice when the read failed", () => {
    render(<EmptyGarden settled={false} failed />);

    for (const menu of menus()) expectVisibleCause(menu, /Garden not read/);
  });

  it("point to the summary's Not read yet before a read answers", () => {
    render(<EmptyGarden settled={false} />);

    for (const menu of menus()) expectVisibleCause(menu, "Not read yet");
  });

  it("point to the empty state's heading once a read answered with no rows", () => {
    render(<EmptyGarden />);

    for (const menu of menus()) expectVisibleCause(menu, "No plants yet");
  });

  it("point to every group line drawn in place of the empty state", () => {
    render(<EmptyGarden groups={PLACES} />);

    for (const menu of menus()) {
      expectVisibleCause(menu, "No beds are dug yet. No pots are bought yet.");
    }
  });

  it("stay open to use while a re-read's skeleton stands in for the empty state", () => {
    vi.useFakeTimers();
    try {
      render(<EmptyGarden reading groups={PLACES} />);
      act(() => {
        vi.advanceTimersByTime(1300);
      });

      expect(screen.queryByText("No beds are dug yet.")).toBeNull();
      for (const menu of menus()) {
        expect(menu).not.toHaveAttribute("aria-disabled");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("open nothing while blocked", async () => {
    render(<EmptyGarden />);

    for (const menu of menus()) {
      await userEvent.click(menu);
      expect(screen.queryByRole("menu")).toBeNull();
    }
  });
});
