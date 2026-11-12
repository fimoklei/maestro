import { type ReactNode, useState } from "react";
import {
  alreadyInHarnessLegend,
  canBeImportedLegend,
  cannotBeImportedLegend,
  REPLACES_LINE,
} from "../deploy-state/import-local-edits-copy";
import { toggleStaged } from "../ui/bulk-selection";
import type { GroupedListGroup } from "../ui/grouped-list";

/** One row an import source lists. */
export type ImportRow<Refusal> = {
  key: string;
  name: string;
  refusal: Refusal | null;
  /** The Harness holds an item under this name, which the import replaces. */
  held: boolean;
};

export type ImportChecklist<Refusal> = {
  /** Null until a source lists rows. */
  rows: readonly ImportRow<Refusal>[] | null;
  checked: ReadonlySet<string>;
  toggle: (key: string) => void;
  /** The checked rows, each marked where it replaces a held item. */
  picked: readonly { key: string; replace: boolean }[];
};

// What the reader changed for one source: a new row starts checked and a held
// one unchecked, so each set holds only the flips.
type Marks<Source> = {
  source: Source;
  unchecked: ReadonlySet<string>;
  replacing: ReadonlySet<string>;
};

const blank = <Source,>(source: Source): Marks<Source> => ({
  source,
  unchecked: new Set(),
  replacing: new Set(),
});

// The checks of Import skills and Import prompts. Another source clears them.
export function useImportChecklist<Source, Refusal>(
  source: Source,
  rows: readonly ImportRow<Refusal>[] | null,
): ImportChecklist<Refusal> {
  const [stored, setStored] = useState(() => blank(source));
  const marks = Object.is(stored.source, source) ? stored : blank(source);
  const isChecked = (row: ImportRow<Refusal>) =>
    row.refusal === null &&
    (row.held ? marks.replacing.has(row.key) : !marks.unchecked.has(row.key));
  const picked = (rows ?? [])
    .filter(isChecked)
    .map(({ key, held }) => ({ key, replace: held }));

  return {
    rows,
    checked: new Set(picked.map(({ key }) => key)),
    toggle: (key) => {
      const row = rows?.find((candidate) => candidate.key === key);
      if (row === undefined || row.refusal !== null) return;
      setStored((current) => {
        const base = Object.is(current.source, source)
          ? current
          : blank(source);
        return row.held
          ? { ...base, replacing: toggleStaged(base.replacing, key) }
          : { ...base, unchecked: toggleStaged(base.unchecked, key) };
      });
    },
    picked,
  };
}

/** The rows as the checklist groups them: new, Already in the Harness, refused. */
export function importChecklistGroups<Refusal>(
  rows: readonly ImportRow<Refusal>[],
  refusalSentence: (refusal: Refusal) => ReactNode,
): GroupedListGroup[] {
  const fresh = rows.filter((row) => row.refusal === null && !row.held);
  const held = rows.filter((row) => row.refusal === null && row.held);
  const refused = rows.flatMap((row) =>
    row.refusal === null ? [] : [{ ...row, refusal: row.refusal }],
  );
  return [
    {
      tone: "neutral",
      legend: canBeImportedLegend(fresh.length),
      rows: fresh.map(({ key, name }) => ({ key, name })),
    },
    {
      tone: "attention",
      legend: alreadyInHarnessLegend(held.length),
      rows: held.map(({ key, name }) => ({
        key,
        name,
        sentence: REPLACES_LINE,
      })),
    },
    {
      tone: "failed",
      legend: cannotBeImportedLegend(refused.length),
      rows: refused.map(({ key, name, refusal }) => ({
        key,
        name,
        sentence: refusalSentence(refusal),
      })),
    },
  ];
}
