import type { RowData } from "@tanstack/react-table";
import { ListFilter, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import type { DataTableProps } from "./data-table";
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
type Groups<T extends RowData> = NonNullable<DataTableProps<T>["groups"]>;

export interface ViewOptionsConfig<T extends RowData> {
  /** The one-of filter: Target on Deploy-state, Type on Inventory. "All" is added. */
  kind: { label: string; options: readonly Option[]; of: (row: T) => string };
  /** Status words worst first, as Filter lists them and Status groups them. */
  status: {
    words: readonly string[];
    of: (row: T) => string | null;
  };
  /** The screen's own groupings; None and Status are added. */
  groupings: readonly (Option & { groups: Groups<T> })[];
  initialGrouping: string;
  /** The columns Display can switch off, by column id. */
  columns: readonly Option[];
  /** Why neither menu can be used, in five words or fewer. */
  unavailable?: string;
}

export type ViewOptions<T extends RowData> = {
  shown: (row: T) => boolean;
  groups: Groups<T> | undefined;
  hidden: ReadonlySet<string>;
  filterCount: number;
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
  const { kind, status } = config;
  const [kindValue, setKind] = useState("all");
  const [statuses, setStatuses] = useState<ReadonlySet<string>>(new Set());
  const [grouping, setGrouping] = useState(config.initialGrouping);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const groupings = [
    { value: "none", label: NONE, groups: undefined },
    ...config.groupings,
    {
      value: "status",
      label: STATUS_LABEL,
      groups: {
        key: (row: T) => status.of(row) ?? NOT_READ_YET,
        order: status.words,
      },
    },
  ];
  const unavailable = rows.length === 0 ? config.unavailable : undefined;
  const filterCount = (kindValue === "all" ? 0 : 1) + statuses.size;

  return {
    shown: (row) => {
      const word = status.of(row);
      return (
        (kindValue === "all" || kind.of(row) === kindValue) &&
        (statuses.size === 0 || (word !== null && statuses.has(word)))
      );
    },
    groups: groupings.find((each) => each.value === grouping)?.groups,
    hidden,
    filterCount,
    menus: [
      {
        label: FILTER_LABEL,
        icon: <Icon of={ListFilter} />,
        unavailable,
        count: filterCount,
        sections: [
          {
            kind: "radio",
            label: kind.label,
            options: [{ value: "all", label: ALL }, ...kind.options],
            value: kindValue,
            onChange: setKind,
          },
          {
            kind: "check",
            label: STATUS_LABEL,
            options: status.words.map((word) => ({ value: word, label: word })),
            values: statuses,
            onToggle: (value) =>
              setStatuses((current) => toggle(current, value)),
          },
        ],
      },
      {
        label: DISPLAY_LABEL,
        icon: <Icon of={SlidersHorizontal} />,
        unavailable,
        sections: [
          {
            kind: "radio",
            label: GROUP_BY_LABEL,
            options: groupings,
            value: grouping,
            onChange: setGrouping,
          },
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
