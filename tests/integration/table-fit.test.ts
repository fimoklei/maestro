import { describe, expect, it } from "vitest";
import { tableFitReport } from "../../scripts/table-fit.mjs";

const fits = {
  screen: "Inventory",
  viewport: 1440,
  detailOpen: false,
  tableWidth: 800,
  roomWidth: 800,
};

describe("tableFitReport", () => {
  it("passes a table no wider than the room it scrolls in", () => {
    expect(tableFitReport([fits])).toEqual({ failures: [], skipped: [] });
  });

  it("forgives the sub-pixel rounding of a fitting table", () => {
    expect(tableFitReport([{ ...fits, tableWidth: 800.6 }]).failures).toEqual(
      [],
    );
  });

  it("names the screen, the widths and the overflow of a table that does not fit", () => {
    expect(
      tableFitReport([
        {
          ...fits,
          screen: "Harness",
          viewport: 1104,
          detailOpen: true,
          roomWidth: 438,
          tableWidth: 486,
        },
      ]).failures,
    ).toEqual([
      "Harness, detail pane open, viewport 1104px: the table is 48px wider than its 438px scroll container",
    ]);
  });

  it("names each shown column an open detail pane covers", () => {
    expect(
      tableFitReport([
        {
          ...fits,
          viewport: 900,
          detailOpen: true,
          covered: ["Status", "Actions"],
        },
      ]).failures,
    ).toEqual([
      "Inventory, detail pane open, viewport 900px: the detail pane covers the Status, Actions columns",
    ]);
  });

  it("passes a detail pane that covers no shown column", () => {
    expect(
      tableFitReport([{ ...fits, detailOpen: true, covered: [] }]).failures,
    ).toEqual([]);
  });

  it("fails a screen whose detail pane did not open", () => {
    expect(
      tableFitReport([
        fits,
        { screen: "Inventory", viewport: 1104, paneOpened: false },
      ]).failures,
    ).toEqual([
      "Inventory, viewport 1104px: a row did not open its detail pane, so the table beside it was not measured",
    ]);
  });

  it("skips a screen that showed no rows to measure", () => {
    expect(
      tableFitReport([
        fits,
        { screen: "Harness", viewport: 1440, rows: false },
      ]),
    ).toEqual({ failures: [], skipped: ["Harness"] });
  });

  it("fails when no screen showed rows to measure", () => {
    expect(
      tableFitReport([{ screen: "Harness", viewport: 1440, rows: false }])
        .failures,
    ).toEqual([
      "no table showed rows to measure — run `pnpm smoke:ready` first",
    ]);
  });
});
