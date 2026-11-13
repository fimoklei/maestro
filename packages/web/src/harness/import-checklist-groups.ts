import type { ReactNode } from "react";
import {
  alreadyInHarnessLegend,
  canBeImportedLegend,
  cannotBeImportedLegend,
  REPLACES_LINE,
} from "../deploy-state/import-local-edits-copy";
import type { GroupedListGroup } from "../ui/grouped-list";

/** One row an import source lists. */
export type ImportRow<Refusal> = {
  key: string;
  name: string;
  refusal: Refusal | null;
  /** The Harness holds an item under this name, which the import replaces. */
  held: boolean;
  /** The category the file names; null where it names none. */
  fileCategory: string | null;
};

/**
 * The rows as the checklist groups them: new, Already in the Harness, refused.
 * `rowParts` adds a row's own control; a refused row takes none.
 */
export function importChecklistGroups<Refusal>(
  rows: readonly ImportRow<Refusal>[],
  refusalSentence: (refusal: Refusal) => ReactNode,
  rowParts: (
    row: ImportRow<Refusal>,
  ) => Pick<GroupedListGroup["rows"][number], "control" | "choice">,
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
      rows: fresh.map((row) => ({
        key: row.key,
        name: row.name,
        ...rowParts(row),
      })),
    },
    {
      tone: "attention",
      legend: alreadyInHarnessLegend(held.length),
      rows: held.map((row) => ({
        key: row.key,
        name: row.name,
        sentence: REPLACES_LINE,
        ...rowParts(row),
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
