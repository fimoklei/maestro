import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { OptionMenuProps } from "./option-menu";
import { useViewOptions, type ViewOptionsConfig } from "./use-view-options";

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
      oneOf: [{ label: "Kind", options: [], of: () => "tree", initial: "all" }],
      status: {
        words: ["Wilting", "Dry", "Healthy"],
        of: (row) => row.status,
      },
      groupings: [],
      defaultGrouping: "none",
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

describe("useViewOptions on a table with no Status column", () => {
  it("offers no Status filter and no grouping, only the columns", () => {
    const { result } = renderHook(() =>
      useViewOptions(PLANTS, {
        oneOf: [
          { label: "Kind", options: [], of: () => "tree", initial: "all" },
        ],
        status: null,
        groupings: [],
        defaultGrouping: "none",
        columns: [{ value: "status", label: "Status" }],
      }),
    );
    const [filter, display] = result.current.menus;

    expect(filter.sections.map((section) => section.label)).toEqual(["Kind"]);
    expect(display.sections.map((section) => section.label)).toEqual([
      "Columns",
    ]);
    expect(PLANTS.filter(result.current.shown)).toHaveLength(PLANTS.length);
    expect(result.current.statusCounts(CHIPS)).toEqual([]);
  });
});

type Shrub = { name: string; soil: string; light: string };

const SHRUBS: Shrub[] = [
  { name: "box", soil: "clay", light: "sun" },
  { name: "holly", soil: "clay", light: "shade" },
  { name: "laurel", soil: "sand", light: "shade" },
];

const SOIL = {
  label: "Soil",
  options: [
    { value: "clay", label: "Clay" },
    { value: "sand", label: "Sand" },
  ],
  of: (row: Shrub) => row.soil,
};
const LIGHT = {
  label: "Light",
  options: [
    { value: "sun", label: "Sun" },
    { value: "shade", label: "Shade" },
  ],
  of: (row: Shrub) => row.light,
};

const radio = (menu: OptionMenuProps, label: string) => {
  const section = menu.sections.find((each) => each.label === label);
  if (section?.kind !== "radio") throw new Error(`no ${label} radio`);
  return section;
};

const shrubsShown = (shown: (row: Shrub) => boolean) =>
  SHRUBS.filter(shown).map((row) => row.name);

const shrubView = (oneOf: ViewOptionsConfig<Shrub>["oneOf"]) =>
  renderHook(() =>
    useViewOptions(SHRUBS, {
      oneOf,
      status: null,
      groupings: [],
      defaultGrouping: "none",
      columns: [],
    }),
  );

describe("useViewOptions one-of filters", () => {
  it("narrows by every one-of filter at once, and clears them all", () => {
    const { result } = shrubView([
      { ...SOIL, initial: "all" },
      { ...LIGHT, initial: "all" },
    ]);
    const filter = () => result.current.menus[0];

    expect(filter().sections.map((section) => section.label)).toEqual([
      "Soil",
      "Light",
    ]);
    expect(radio(filter(), "Soil").options.map((each) => each.label)).toEqual([
      "All",
      "Clay",
      "Sand",
    ]);

    act(() => radio(filter(), "Soil").onChange("clay"));
    act(() => radio(filter(), "Light").onChange("shade"));
    expect(shrubsShown(result.current.shown)).toEqual(["holly"]);
    expect(result.current.filterCount).toBe(2);

    act(() => result.current.clearFilters());
    expect(shrubsShown(result.current.shown)).toEqual([
      "box",
      "holly",
      "laurel",
    ]);
    expect(radio(filter(), "Light").value).toBe("all");
    expect(result.current.filterCount).toBe(0);
  });

  it("starts each filter at its initial value", () => {
    const { result } = shrubView([
      { ...SOIL, initial: "all" },
      { ...LIGHT, initial: "shade" },
    ]);

    expect(radio(result.current.menus[0], "Light").value).toBe("shade");
    expect(shrubsShown(result.current.shown)).toEqual(["holly", "laurel"]);
    expect(result.current.filterCount).toBe(1);
  });

  it("reads an initial value that matches no option as All", () => {
    const { result } = shrubView([{ ...SOIL, initial: "loam" }]);

    expect(radio(result.current.menus[0], "Soil").value).toBe("all");
    expect(shrubsShown(result.current.shown)).toEqual([
      "box",
      "holly",
      "laurel",
    ]);
    expect(result.current.filterCount).toBe(0);
  });
});

describe("useViewOptions default grouping", () => {
  const BY_SOIL = { value: "soil", label: "Soil", groups: { key: SOIL.of } };
  const BY_LIGHT = {
    value: "light",
    label: "Light",
    groups: { key: LIGHT.of },
  };
  const groupedBy = (defaultGrouping: string) =>
    renderHook(
      ({ grouping }) =>
        useViewOptions(SHRUBS, {
          oneOf: [],
          status: null,
          groupings: [BY_SOIL, BY_LIGHT],
          defaultGrouping: grouping,
          columns: [],
        }),
      { initialProps: { grouping: defaultGrouping } },
    );
  const groupBy = (menu: OptionMenuProps) => radio(menu, "Group by");

  it("follows a default that changes after the first render", () => {
    const { result, rerender } = groupedBy("none");
    expect(result.current.groups).toBeUndefined();

    rerender({ grouping: "soil" });
    expect(groupBy(result.current.menus[1]).value).toBe("soil");
    expect(result.current.groups).toBe(BY_SOIL.groups);
  });

  it("keeps the operator's pick once made, whatever the default does", () => {
    const { result, rerender } = groupedBy("soil");
    act(() => groupBy(result.current.menus[1]).onChange("light"));

    rerender({ grouping: "none" });
    expect(groupBy(result.current.menus[1]).value).toBe("light");
    expect(result.current.groups).toBe(BY_LIGHT.groups);
  });
});
