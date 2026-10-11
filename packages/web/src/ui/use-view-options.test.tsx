import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useViewOptions } from "./use-view-options";

type Plant = { name: string; status: string | null };

const PLANTS: Plant[] = [
  { name: "oak", status: "Wilting" },
  { name: "fir", status: "Dry" },
  { name: "ash", status: "Dry" },
  { name: "elm", status: "Healthy" },
  { name: "yew", status: null },
];

const CHIPS = [
  { word: "Dry", family: "attention", covers: ["Dry"] },
  { word: "Trouble", family: "failed", covers: ["Wilting", "Dry"] },
] as const;

const setup = () =>
  renderHook(() =>
    useViewOptions(PLANTS, {
      kind: { label: "Kind", options: [], of: () => "tree" },
      status: {
        words: ["Wilting", "Dry", "Healthy"],
        of: (row) => row.status,
      },
      groupings: [],
      initialGrouping: "none",
      columns: [],
    }),
  );

describe("useViewOptions statusCounts", () => {
  it("counts every row by its status, whatever the filter shows", () => {
    const { result } = setup();
    act(() => result.current.statusCounts(CHIPS)[0]?.filter?.onToggle());

    expect(
      result.current
        .statusCounts(CHIPS)
        .map(({ word, count, family }) => ({ word, count, family })),
    ).toEqual([
      { word: "Dry", count: 2, family: "attention" },
      { word: "Trouble", count: 3, family: "failed" },
    ]);
    expect(PLANTS.filter(result.current.shown).map((row) => row.name)).toEqual([
      "fir",
      "ash",
    ]);
  });

  it("toggles the same status filter as the Filter menu", () => {
    const { result } = setup();
    const status = () => {
      const section = result.current.menus[0].sections[1];
      if (section?.kind !== "check") throw new Error("no status section");
      return section;
    };
    act(() => status().onToggle("Dry"));

    const dry = () => result.current.statusCounts(CHIPS)[0];
    expect(dry()?.filter?.pressed).toBe(true);
    act(() => dry()?.filter?.onToggle());
    expect(status().values.has("Dry")).toBe(false);
    expect(result.current.filterCount).toBe(0);
  });

  it("checks and clears every word of a multi-word chip, pressed only when all are checked", () => {
    const { result } = setup();
    const dry = () => result.current.statusCounts(CHIPS)[0];
    const trouble = () => result.current.statusCounts(CHIPS)[1];

    act(() => dry()?.filter?.onToggle());
    expect(trouble()?.filter?.pressed).toBe(false);
    act(() => trouble()?.filter?.onToggle());
    expect(trouble()?.filter?.pressed).toBe(true);
    expect(result.current.filterCount).toBe(2);
    act(() => trouble()?.filter?.onToggle());
    expect(result.current.filterCount).toBe(0);
  });
});
