import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sentence } from "../test-utils";
import { createDataTableColumns, DataTable } from "./data-table";
import { reading } from "./status-reading";

type Seed = { name: string; ripe: boolean };

const seeds: Seed[] = [
  { name: "pear", ripe: true },
  { name: "apple", ripe: false },
];

const RIPE = reading("Ripe", "good");
const GREEN = reading("Green", "attention");

const statusOf = (seed: Seed) => (seed.ripe ? RIPE : GREEN);

function seedColumns({
  keyboard = { status: true, origin: true },
  appleCard = true,
}: {
  keyboard?: { status: boolean; origin: boolean };
  appleCard?: boolean;
} = {}) {
  return createDataTableColumns<Seed>((helper) => [
    helper.accessor("name", { header: "Name" }),
    {
      ...helper.display({
        id: "status",
        header: "Status",
        cell: ({ row }) => statusOf(row.original).word,
      }),
      card: {
        keyboard: keyboard.status,
        content: (seed: Seed) =>
          seed.name === "apple" && !appleCard
            ? null
            : {
                reading: statusOf(seed),
                value: <span>v1.0.0</span>,
                body: [`The ${seed.name} is ${statusOf(seed).word}.`],
                readAge: "Read just now",
              },
      },
    },
    {
      ...helper.display({
        id: "origin",
        header: "Origin",
        cell: () => "Orchard",
      }),
      card: {
        keyboard: keyboard.origin,
        content: (seed: Seed) => ({
          reading: statusOf(seed),
          body: [`The ${seed.name} grew in the orchard.`],
        }),
      },
    },
  ]);
}

function renderSeeds(
  props: Partial<React.ComponentProps<typeof DataTable<Seed>>> = {},
) {
  return render(
    <DataTable
      label="Seed table"
      columns={seedColumns()}
      data={seeds}
      getRowId={(seed) => seed.name}
      {...props}
    />,
  );
}

const grid = () => screen.getByRole("grid", { name: "Seed table" });
const rowOf = (name: string) =>
  within(grid())
    .getAllByRole("row")
    .find((row) => within(row).queryByText(name) !== null) as HTMLElement;

const follows = (a: Node, b: Node) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

afterEach(() => {
  vi.useRealTimers();
});

describe("DataTable — a declared card", () => {
  it("opens to the pointer after 400 ms with the badge, value, body and read age in that order", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderSeeds();

    fireEvent.pointerEnter(within(rowOf("pear")).getByText("Ripe"), {
      pointerType: "mouse",
    });
    act(() => vi.advanceTimersByTime(399));
    expect(screen.queryByText("The pear is Ripe.")).toBeNull();
    act(() => vi.advanceTimersByTime(1));

    const badge = screen.getAllByText("Ripe").at(-1) as HTMLElement;
    const value = screen.getByText("v1.0.0");
    const body = screen.getByText(sentence("The pear is Ripe."));
    const age = screen.getByText("Read just now");
    expect(follows(badge, value)).toBe(true);
    expect(follows(value, body)).toBe(true);
    expect(follows(body, age)).toBe(true);
  });

  it("closes 150 ms after the pointer leaves", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderSeeds();
    const trigger = within(rowOf("pear")).getByText("Ripe");

    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerLeave(trigger, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(149));
    expect(screen.getByText("The pear is Ripe.")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByText("The pear is Ripe.")).toBeNull();
  });

  it("toggles on a tap", () => {
    renderSeeds();
    const trigger = within(rowOf("apple")).getByText("Green");

    fireEvent.pointerUp(trigger, { pointerType: "touch" });
    expect(screen.getByText("The apple is Green.")).toBeInTheDocument();
    fireEvent.pointerUp(trigger, { pointerType: "touch" });
    expect(screen.queryByText("The apple is Green.")).toBeNull();
  });

  it("opens the active row's keyboard card at once, and only the first shown one", () => {
    renderSeeds();

    act(() => grid().focus());

    expect(screen.getByText("The pear is Ripe.")).toBeInTheDocument();
    expect(screen.queryByText("The pear grew in the orchard.")).toBeNull();
    expect(screen.queryByText("The apple is Green.")).toBeNull();
  });

  it("opens the next keyboard card while the first one's column is hidden", () => {
    renderSeeds({ columnVisibility: { status: false } });

    act(() => grid().focus());

    expect(
      screen.getByText("The pear grew in the orchard."),
    ).toBeInTheDocument();
  });

  it("never opens a pointer-only card on the active row", () => {
    renderSeeds({
      columns: seedColumns({ keyboard: { status: false, origin: false } }),
    });

    act(() => grid().focus());

    expect(screen.queryByText("The pear is Ripe.")).toBeNull();
    expect(screen.queryByText("The pear grew in the orchard.")).toBeNull();
  });

  it("draws a cell without a card when its row declares none", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderSeeds({ columns: seedColumns({ appleCard: false }) });

    fireEvent.pointerEnter(within(rowOf("apple")).getByText("Green"), {
      pointerType: "mouse",
    });
    act(() => vi.advanceTimersByTime(400));

    expect(screen.queryByText("The apple is Green.")).toBeNull();
  });

  it("draws a card without a reading as its body alone, then its facts", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderSeeds({
      columns: createDataTableColumns<Seed>((helper) => [
        helper.accessor("name", { header: "Name" }),
        {
          ...helper.display({
            id: "box",
            header: "Box",
            cell: () => "Crate",
          }),
          card: {
            keyboard: false,
            content: (seed: Seed) => ({
              body: [`The ${seed.name} ships in a crate.`],
              facts: [
                { label: "Weight", value: "2 kg" },
                { label: "Route", value: "orchard/north → market" },
              ],
            }),
          },
        },
      ]),
    });

    fireEvent.pointerEnter(within(rowOf("pear")).getByText("Crate"), {
      pointerType: "mouse",
    });
    act(() => vi.advanceTimersByTime(400));

    const body = screen.getByText("The pear ships in a crate.");
    const card = body.closest(
      "[data-radix-popper-content-wrapper]",
    ) as HTMLElement;
    expect(card.textContent?.startsWith("The pear ships")).toBe(true);
    const labels = within(card).getAllByRole("term");
    expect(labels.map((label) => label.textContent)).toEqual([
      "Weight",
      "Route",
    ]);
    expect(follows(body, labels[0] as HTMLElement)).toBe(true);
    expect(
      within(card)
        .getAllByRole("definition")
        .map((value) => value.textContent),
    ).toEqual(["2 kg", "orchard/north → market"]);
  });
});
