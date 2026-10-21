import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Trees } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { type Band, BandRow } from "./band";
import type { BandCount } from "./band-summary";
import type { Freshness } from "./freshness";
import { Icon } from "./icon";

const width = vi.hoisted(() => ({ rem: null as number | null }));
vi.mock("./use-width-rem", () => ({ useWidthRem: () => width.rem }));

const minutesAgo = (minutes: number) => Date.now() - minutes * 60_000;
const READ: Freshness = { readAt: [minutesAgo(4)], outcome: "fetched" };
const UNKNOWN: BandCount = { word: "Unknown", count: 2, family: "failed" };
const BEHIND: BandCount = { word: "Behind", count: 4, family: "attention" };
const LOCAL_EDITS: BandCount = {
  word: "Local edits",
  count: 0,
  family: "attention",
};

const band = (
  freshness: Freshness,
  counts: readonly BandCount[] = [],
): Band => ({
  facts: [
    { label: "Trees", value: "12", icon: <Icon of={Trees} />, machine: false },
  ],
  summary: { freshness, healthy: "In sync", counts },
  labelsBelowRem: 60,
  countsBelowRem: 20,
});

const renderBand = (value: Band) =>
  render(
    <BandRow band={value}>
      <button type="button">Re-read</button>
    </BandRow>,
  );

// Each shown word or count, in reading order.
const shown = (...texts: string[]) => {
  const nodes = texts.map((text) => screen.getByText(text));
  nodes.reduce((before, after) => {
    expect(
      before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    return after;
  });
};

describe("BandRow", () => {
  it("reads the healthy word when nothing needs action", () => {
    renderBand(band(READ, [{ ...BEHIND, count: 0 }]));

    shown("In sync");
  });

  it("reads the counts above 0, worst first, and no count at 0", () => {
    renderBand(band(READ, [UNKNOWN, LOCAL_EDITS, BEHIND]));

    shown("Unknown 2", "Behind 4");
    expect(screen.queryByText(/Local edits/)).toBeNull();
  });

  it("shows a gate count at 0 under its id, for a blocked control to point at", () => {
    render(
      <BandRow
        band={band(READ, [
          BEHIND,
          { ...LOCAL_EDITS, gate: { id: "local-edits-count" } },
        ])}
      >
        <button type="button" aria-describedby="local-edits-count">
          Import local edits
        </button>
      </BandRow>,
    );

    shown("Behind 4", "Local edits 0");
    expect(
      screen.getByRole("button", { name: "Import local edits" }),
    ).toHaveAccessibleDescription("Local edits 0");
  });

  it("reads the attention counts alone", () => {
    renderBand(band(READ, [{ ...UNKNOWN, count: 0 }, BEHIND]));

    shown("Behind 4");
    expect(screen.queryByText(/Unknown/)).toBeNull();
  });

  it.each([
    [{ readAt: [null], outcome: null }, "Not read yet"],
    [{ readAt: [minutesAgo(120)], outcome: "fetch-failed" }, "Read failed"],
    [{ readAt: [minutesAgo(120)], outcome: "offline" }, "Offline"],
  ] satisfies [Freshness, string][])(
    "reads the summary word for a reading that gives no counts",
    (freshness, word) => {
      renderBand(band(freshness, [BEHIND]));

      shown(word);
      expect(screen.queryByText("Behind 4")).toBeNull();
    },
  );

  it("ends the left side with the read age, heard as Read and the age", () => {
    renderBand(band(READ));

    const age = screen.getByRole("img", { name: "Read" }).parentElement;
    expect(age?.textContent).toBe("4 min ago");
    const fact = screen.getByText("Trees");
    expect(
      fact.compareDocumentPosition(age as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("dates a failed read as the last read", () => {
    renderBand(band({ readAt: [minutesAgo(120)], outcome: "offline" }));

    expect(screen.getByText("last read 2 h ago")).toBeInTheDocument();
  });

  it("shows no age before the first read", () => {
    renderBand(band({ readAt: [null], outcome: null }));

    expect(screen.queryByRole("img", { name: "Read" })).toBeNull();
  });

  describe("on a narrow band", () => {
    const NARROW: Band = {
      ...band(READ, [BEHIND]),
      facts: [
        {
          label: "Origin",
          value: "orchard/fruit",
          icon: <Icon of={Trees} />,
          machine: true,
          drop: { rank: 1, belowRem: 50 },
        },
        {
          label: "Trees",
          value: "12",
          icon: <Icon of={Trees} />,
          machine: false,
          drop: { rank: 2, belowRem: 30 },
        },
      ],
    };
    // Visible labels, values and counts, in reading order.
    const visible = () =>
      Array.from(
        document.querySelectorAll("dt, dd, [data-count]:not(.sr-only)"),
        (each) => (each.querySelector(".sr-only") ? "" : each.textContent),
      ).filter((text) => text !== "");

    it.each([
      [70, ["Behind 4", "Origin", "orchard/fruit", "Trees", "12"]],
      [55, ["Behind 4", "orchard/fruit", "12"]],
      [40, ["Behind 4", "12"]],
      [25, ["Behind 4"]],
      [15, []],
    ])("at %s rem shows %j", (rem, texts) => {
      width.rem = rem;
      renderBand(NARROW);

      expect(visible()).toEqual(texts);
      width.rem = null;
    });

    it("keeps the dot and the read age at the narrowest", () => {
      width.rem = 10;
      const { container } = renderBand(NARROW);

      expect(container.querySelector(".rounded-full")).not.toBeNull();
      expect(screen.getByRole("img", { name: "Read" })).toBeInTheDocument();
      expect(screen.getByText("4 min ago")).toBeInTheDocument();
      width.rem = null;
    });
  });

  it("makes a filtering count a button that toggles its filter", async () => {
    const onToggle = vi.fn();
    renderBand(
      band(READ, [{ ...BEHIND, filter: { pressed: false, onToggle } }]),
    );

    const chip = screen.getByRole("button", { name: "Behind 4" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("marks an active chip pressed, with a ×", () => {
    renderBand(
      band(READ, [
        { ...BEHIND, filter: { pressed: true, onToggle: () => {} } },
      ]),
    );

    const chip = screen.getByRole("button", { name: "Behind 4" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip.querySelector("svg")).not.toBeNull();
  });

  it("keeps a count without a filter as plain text", () => {
    renderBand(band(READ, [BEHIND]));

    expect(screen.queryByRole("button", { name: "Behind 4" })).toBeNull();
  });
});
