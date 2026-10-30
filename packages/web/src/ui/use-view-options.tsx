import type { RowData } from "@tanstack/react-table";
import { ListFilter, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { type BandCount, countOf, type StatusChip } from "./band-summary";
import type { RowGroups } from "./data-table";
import { NOT_READ_YET } from "./freshness";
import { Icon } from "./icon";
import type { OptionMenuProps } from "./option-menu";
import {
  ALL,
  COLUMNS_LABEL,
  DISPLAY_LABEL,
  FILTER_LABEL,
  GROUP_BY_LABEL,
  NONE,
  STATUS_LABEL,
} from "./view-options-copy";

type Option = { value: string; label: string };
type Groups<T extends RowData> = RowGroups<T>;

type OneOfFilter<T extends RowData> = {
  label: string;
  options: readonly Option[];
  of: (row: T) => string;
  /** The value it starts at; one that matches no option reads as All. */
  initial: string;
};

const ALL_VALUE = "all";

export interface ViewOptionsConfig<T extends RowData> {
  /** The one-of filters, such as Target on Deploy-state. "All" is added to each. */
  oneOf: readonly OneOfFilter<T>[];
  /** Status words worst first, as Filter lists them and Status groups them; null on a table with no Status column. */
  status: {
    words: readonly string[];
    of: (row: T) => string | null;
  } | null;
  /** The screen's own groupings; None and Status are added. */
  groupings: readonly (Option & { groups: Groups<T> })[];
  /** The grouping until the operator picks one; it may change between renders. */
  defaultGrouping: string;
  /** The columns Display can switch off, by column id. */
  columns: readonly Option[];
}

export type ViewOptions<T extends RowData> = {
  shown: (row: T) => boolean;
  groups: Groups<T> | undefined;
  hidden: ReadonlySet<string>;
  filterCount: number;
  /** No row to narrow, group or hide: neither menu can be used. */
  blocked: boolean;
  /** Sets every filter back to All, so each row shows again. */
  clearFilters: () => void;
  /** Band 2's counts over every row, each wired to the status filter. */
  statusCounts: (chips: readonly StatusChip[]) => BandCount[];
  /** Filter, then Display, for band 2. */
  menus: readonly [OptionMenuProps, OptionMenuProps];
};

const toggle = (set: ReadonlySet<string>, value: string) => {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
};

/** A table screen's Filter and Display: their state, and what they do to the table. */
export function useViewOptions<T extends RowData>(
  rows: readonly T[],
  config: ViewOptionsConfig<T>,
): ViewOptions<T> {
  const { oneOf, status } = config;
  // Keyed by filter label; a filter without a pick stands at its initial value.
  const [picks, setPicks] = useState<ReadonlyMap<string, string>>(new Map());
  const [statuses, setStatuses] = useState<ReadonlySet<string>>(new Set());
  const [pickedGrouping, setGrouping] = useState<string | null>(null);
  const grouping = pickedGrouping ?? config.defaultGrouping;
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const groupings = [
    { value: "none", label: NONE, groups: undefined },
    ...config.groupings,
    ...(status === null
      ? []
      : [
          {
            value: "status",
            label: STATUS_LABEL,
            groups: {
              key: (row: T) => status.of(row) ?? NOT_READ_YET,
              order: status.words,
            },
          },
        ]),
  ];
  // The value checked against the options on every render, so a value that
  // matches none, now or after the options change, reads as All.
  const filters = oneOf.map((filter) => {
    const value = picks.get(filter.label) ?? filter.initial;
    return {
      ...filter,
      value: filter.options.some((option) => option.value === value)
        ? value
        : ALL_VALUE,
    };
  });
  const active = filters.filter((filter) => filter.value !== ALL_VALUE);
  const filterCount = active.length + statuses.size;

  return {
    shown: (row) => {
      const word = status === null ? null : status.of(row);
      return (
        active.every((filter) => filter.of(row) === filter.value) &&
        (statuses.size === 0 || (word !== null && statuses.has(word)))
      );
    },
    groups: groupings.find((each) => each.value === grouping)?.groups,
    hidden,
    filterCount,
    blocked: rows.length === 0,
    clearFilters: () => {
      setPicks(new Map(oneOf.map((filter) => [filter.label, ALL_VALUE])));
      setStatuses(new Set());
    },
    statusCounts: (chips) => {
      if (status === null) return [];
      const words = rows.map(status.of);
      return chips.map(({ covers, ...chip }) => {
        const pressed = covers.every((word) => statuses.has(word));
        return {
          ...chip,
          count: countOf(words, ...covers),
          filter: {
            pressed,
            onToggle: () =>
              setStatuses((current) => {
                const next = new Set(current);
                for (const word of covers) {
                  if (pressed) next.delete(word);
                  else next.add(word);
                }
                return next;
              }),
          },
        };
      });
    },
    menus: [
      {
        label: FILTER_LABEL,
        icon: <Icon of={ListFilter} />,
        count: filterCount,
        sections: [
          ...filters.map((filter) => ({
            kind: "radio" as const,
            label: filter.label,
            options: [{ value: ALL_VALUE, label: ALL }, ...filter.options],
            value: filter.value,
            onChange: (value: string) =>
              setPicks((current) => new Map(current).set(filter.label, value)),
          })),
          ...(status === null
            ? []
            : [
                {
                  kind: "check" as const,
                  label: STATUS_LABEL,
                  options: status.words.map((word) => ({
                    value: word,
                    label: word,
                  })),
                  values: statuses,
                  onToggle: (value: string) =>
                    setStatuses((current) => toggle(current, value)),
                },
              ]),
        ],
      },
      {
        label: DISPLAY_LABEL,
        icon: <Icon of={SlidersHorizontal} />,
        sections: [
          // None alone groups nothing, so it is no choice.
          ...(groupings.length === 1
            ? []
            : [
                {
                  kind: "radio" as const,
                  label: GROUP_BY_LABEL,
                  options: groupings,
                  value: grouping,
                  onChange: setGrouping,
                },
              ]),
          {
            kind: "check",
            label: COLUMNS_LABEL,
            options: config.columns,
            values: new Set(
              config.columns
                .map((column) => column.value)
                .filter((value) => !hidden.has(value)),
            ),
            onToggle: (value) => setHidden((current) => toggle(current, value)),
          },
        ],
      },
    ],
  };
}
