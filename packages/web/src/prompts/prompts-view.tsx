import type { CategoryList, InventoryPrompt } from "@maestro/core";
import { useMutation } from "@tanstack/react-query";
import { MessageSquare, Table2, Tag } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { categoryView } from "../categories/category-view";
import { SetCategoryBarAction } from "../categories/set-category-bar-action";
import { usePaneCategory } from "../categories/use-pane-category";
import { promptReadNotice } from "../harness/import-prompt-copy";
import { ImportPromptDialog } from "../harness/import-prompt-dialog";
import { useEditPromptFlow } from "../harness/use-edit-prompt-flow";
import {
  hiddenStagedCount,
  setStagedMany,
  toggleStaged,
} from "../inventory/bulk-selection";
import {
  type CloneReading,
  deleteItem,
  inClone,
} from "../inventory/clone-reading";
import { PaneDeletion } from "../inventory/pane-deletion";
import { filterByName } from "../inventory/type-filter";
import type { HarnessFacts } from "../skills/skills-band";
import {
  NOT_RELEASED_YET,
  ORIGIN_FACT,
  RELEASE_FACT,
  UNKNOWN_FACT_VALUE,
} from "../ui/band-copy";
import { Button } from "../ui/button";
import {
  COPY_PROMPT,
  DELETE_PROMPT,
  EDIT_PROMPT,
  rereadLabel,
  SET_CATEGORY,
} from "../ui/control-labels";
import { type Reading, readFreshness, useFreshnessLine } from "../ui/freshness";
import { GitHubMark } from "../ui/github-mark-link";
import { Icon } from "../ui/icon";
import { named, phrase } from "../ui/phrase";
import { SelectionBar } from "../ui/selection-bar";
import { TableScreen } from "../ui/table-screen";
import { type ReadFailure, useTableScreen } from "../ui/use-table-screen";
import { useViewOptions } from "../ui/use-view-options";
import { useWriteAction, type WriteResult } from "../ui/use-write-action";
import { PromptDetailPane } from "./prompt-detail-pane";
import {
  COUNTS_BELOW_REM,
  LABELS_BELOW_REM,
  ORIGIN_DROP,
  PROMPTS_DROP,
  RELEASED_DROP,
  SEARCH_ICON_BELOW_REM,
} from "./prompts-band";
import {
  DISPLAY_OPTIONS,
  type PromptItem,
  type PromptRow,
  promptsColumns,
  type RowAction,
} from "./prompts-columns";
import {
  FINDING_LABEL,
  NAME_NOT_VALID,
  NO_FILTER_MATCH,
  NO_RELEASED_PROMPTS,
  NO_SEARCH_MATCH,
  PROMPTS_FACT,
  promptsFactValue,
  SEARCH_LABEL,
  SELECT_ALL_PROMPTS,
  SELECT_PROMPTS,
  selectPromptLabel,
} from "./prompts-copy";

// The default branch no longer holds the file under this name.
const leavesDefaultBranch = ({ pendingRelease }: InventoryPrompt) =>
  pendingRelease?.change === "deletion" || pendingRelease?.change === "rename";

// Step 1 of Delete prompt, offered only once the clone's read holds the file.
type Deletion = { path: string; localOnly: boolean };

const deletionOf = (clone: CloneReading, name: string): Deletion | null => {
  const file = inClone(clone, name);
  return file === null ? null : { path: file.path, localOnly: file.localOnly };
};

// Presentational; the container supplies the reads (#1598).
export function PromptsView({
  prompts,
  harness,
  reads,
  failure,
  reading,
  onReread,
  onOpenHarness,
  clone,
  localDeletions,
  onDeleted,
  onEdited,
  assignments,
  categoryNames,
  initialCategory,
}: {
  /** Undefined until the Inventory has been read once. */
  prompts: InventoryPrompt[] | undefined;
  /** Each item's category; undefined while unread, which leaves Set category and the selection out. */
  assignments: CategoryList["assignments"] | undefined;
  /** The category list's names in order; undefined while unread. */
  categoryNames: readonly string[] | undefined;
  /** The category Filter starts at, from the URL; null for All. */
  initialCategory: string | null;
  /** The connected Harness: undefined until read, null where its read failed. */
  harness: HarnessFacts | null | undefined;
  /** Every reading the prompts rest on. */
  reads: readonly Reading[];
  /** A failed read; the previous rows stay under it. */
  failure: ReadFailure | null;
  /** A read is running, shown or not. */
  reading: boolean;
  onReread: () => void;
  // Supplied by the container, so this component stays routerless and storyable.
  onOpenHarness?: () => void;
  /** Gates Delete prompt on each row. */
  clone: CloneReading;
  /** Prompts the Harness holds a deletion of, which Restore prompt undoes. */
  localDeletions: ReadonlySet<string>;
  /** Step 1 of a deletion landed; the next step is on the Harness view. */
  onDeleted: (prompt: string, written: WriteResult) => void;
  /** An edit landed in the Working Harness; its row is on the Harness view. */
  onEdited: (prompt: string, written: WriteResult) => void;
}) {
  const screen = useTableScreen({
    name: PROMPTS_FACT,
    reading,
    settled: prompts !== undefined,
    failure,
    readFailed: failure !== null,
    onReread,
    openOnArrival: null,
  });
  const [query, setQuery] = useState("");
  const [deletion, setDeletion] = useState<Deletion | null>(null);
  const category = usePaneCategory({
    type: "prompt",
    assignments,
    reread: rereadLabel(screen.name),
  });
  // Apart from the open row, so inspecting and selecting never toggle each other.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Opening a row any other way drops a menu item's dialog.
  const state = {
    ...screen,
    open: (name: string | null) => {
      setDeletion(null);
      category.setOpen(false);
      screen.open(name);
    },
  };
  // Without a clipboard (no secure context, no permission) the write rejects.
  const copying = useMutation({
    mutationFn: (prompt: InventoryPrompt) =>
      navigator.clipboard.writeText(prompt.text),
  });
  const copyWrite = useWriteAction(copying, {
    screen,
    action: "copy",
    // The copy lands on the clipboard, not in a row.
    subject: (_done, prompt) => ({
      name: phrase`${named(prompt.name)}`,
      row: null,
    }),
    // The refusal is the pane's notice.
    failure: () => null,
  });
  // The prompt whose last copy the browser refused; its pane says so.
  const copyRefusedFor = copying.isError
    ? (copying.variables?.name ?? null)
    : null;
  const editFlow = useEditPromptFlow({
    screen: "prompts",
    writes: screen,
    onEdited,
  });
  // A read that found nothing opens no dialog; the row's pane says why.
  const edit = (name: string) => editFlow.start(name, () => state.open(name));
  const readRefusal = editFlow.readRefusal;
  const readNotice = (name: string) =>
    readRefusal === null || readRefusal.name !== name
      ? null
      : promptReadNotice(readRefusal.error, {
          name,
          origin: harness?.origin ?? null,
          localDeletion: localDeletions.has(name),
        });
  const copy = (prompt: InventoryPrompt) =>
    copyWrite.run(prompt, { onError: () => screen.open(prompt.name) });
  const run: Record<RowAction, (prompt: InventoryPrompt) => void> = {
    copy,
    edit: (prompt) => edit(prompt.name),
    category: (prompt) => {
      screen.open(prompt.name);
      setDeletion(null);
      category.setOpen(true);
    },
    delete: (prompt) => {
      screen.open(prompt.name);
      category.setOpen(false);
      setDeletion(deletionOf(clone, prompt.name));
    },
  };
  // Columns built once: rebuilt cells would drop the focus ⋮ gets back.
  const act = (prompt: InventoryPrompt, action: RowAction) =>
    run[action](prompt);
  const actRef = useRef(act);
  actRef.current = act;

  const freshness = readFreshness(reads);
  // A hover card dates the reading it states.
  const readAge = useFreshnessLine(freshness);
  const all = prompts ?? [];
  const rows: PromptRow[] = all.map((prompt) => {
    // The pane's name warning or Pending release fact says what comes first.
    const editable = prompt.nameValid && !leavesDefaultBranch(prompt);
    const copyItem: PromptItem = { action: "copy", label: COPY_PROMPT };
    const editItem: PromptItem = { action: "edit", label: EDIT_PROMPT };
    const categoryItems: PromptItem[] = category.offered
      ? [{ action: "category", label: SET_CATEGORY }]
      : [];
    // Every write refuses a bad name: the pane's warning says to rename it.
    const deleteItems: PromptItem[] = prompt.nameValid
      ? deleteItem(clone, prompt.name, DELETE_PROMPT)
      : [];
    return {
      ...prompt,
      category: category.categoryOf(prompt.name),
      menu: [
        copyItem,
        ...(editable ? [editItem] : []),
        ...categoryItems,
        ...deleteItems,
      ],
      foot: [
        copyItem,
        { ...editItem, disabled: !editable },
        ...categoryItems,
        ...deleteItems,
      ],
      readAge,
    };
  });

  const byCategory = categoryView({
    names: categoryNames,
    of: (row: PromptRow) => row.category,
    rows,
    initial: initialCategory,
  });
  const view = useViewOptions(rows, {
    ...byCategory,
    oneOf: [
      ...byCategory.oneOf,
      {
        label: FINDING_LABEL,
        options: [{ value: NAME_NOT_VALID, label: NAME_NOT_VALID }],
        of: (row) => (row.nameValid ? "" : NAME_NOT_VALID),
        initial: "all",
      },
    ],
    status: null,
    columns: DISPLAY_OPTIONS,
  });

  const columns = useMemo(
    () =>
      promptsColumns({
        onAction: (row, action) => actRef.current(row, action),
      }),
    [],
  );

  const matched = new Set(filterByName(rows, query).map((row) => row.name));
  const searched = (row: PromptRow) => matched.has(row.name);
  const shownNames = rows
    .filter((row) => searched(row) && view.shown(row))
    .map((row) => row.name);
  const shownCount = shownNames.length;
  const reread = rereadLabel(screen.name);

  return (
    <>
      <TableScreen
        state={state}
        band={{
          facts: [
            ...(harness === undefined
              ? []
              : [
                  {
                    label: ORIGIN_FACT,
                    icon: <GitHubMark />,
                    value: harness?.origin ?? UNKNOWN_FACT_VALUE,
                    github: harness?.github,
                    machine: harness !== null,
                    drop: ORIGIN_DROP,
                  },
                  {
                    label: RELEASE_FACT,
                    icon: <Icon of={Tag} />,
                    value:
                      harness === null
                        ? UNKNOWN_FACT_VALUE
                        : (harness.latestRelease ?? NOT_RELEASED_YET),
                    machine: harness?.latestRelease != null,
                    drop: RELEASED_DROP,
                  },
                ]),
            ...(prompts === undefined
              ? []
              : [
                  {
                    label: PROMPTS_FACT,
                    icon: <Icon of={MessageSquare} />,
                    value: promptsFactValue(shownCount, all.length),
                    machine: false,
                    drop: PROMPTS_DROP,
                  },
                ]),
          ],
          summary: { freshness, counts: null },
          search: {
            label: SEARCH_LABEL,
            value: query,
            onChange: setQuery,
            iconBelowRem: SEARCH_ICON_BELOW_REM,
          },
          labelsBelowRem: LABELS_BELOW_REM,
          countsBelowRem: COUNTS_BELOW_REM,
        }}
        rereading={screen.reading}
        firstReadRows={12}
        rows={rows}
        columns={columns}
        rowId={(row) => row.name}
        shown={searched}
        view={view}
        noMatch={view.filterCount > 0 ? NO_FILTER_MATCH : NO_SEARCH_MATCH}
        empty={{
          ...NO_RELEASED_PROMPTS,
          icon: <Icon of={Table2} />,
          action:
            onOpenHarness === undefined ? undefined : (
              <Button variant="quiet" onClick={onOpenHarness}>
                Open Harness
              </Button>
            ),
        }}
        selection={
          assignments === undefined
            ? undefined
            : {
                label: SELECT_PROMPTS,
                allLabel: SELECT_ALL_PROMPTS,
                rowLabel: (row) => selectPromptLabel(row.name),
                selected,
                onToggle: (row) =>
                  setSelected((current) => toggleStaged(current, row.name)),
                onSetSelected: (many, select) =>
                  setSelected((current) =>
                    setStagedMany(
                      current,
                      many.map((row) => row.name),
                      select,
                    ),
                  ),
              }
        }
        // Rises with the first choice and leaves with the last.
        selectionBar={
          assignments !== undefined && selected.size > 0 ? (
            <SelectionBar
              count={selected.size}
              hiddenCount={hiddenStagedCount(selected, shownNames)}
              onClear={() => setSelected(new Set())}
            >
              <SetCategoryBarAction
                type="prompt"
                names={[...selected]}
                reread={reread}
                onSelectionSpent={() => setSelected(new Set())}
              />
            </SelectionBar>
          ) : null
        }
        pane={(row, frame) => (
          <>
            <PromptDetailPane
              prompt={row}
              latestRelease={harness?.latestRelease}
              copyRefused={copyRefusedFor === row.name}
              readRefusal={readNotice(row.name)}
              onCopy={() => copy(row)}
              category={row.category}
              footItems={row.foot.map(({ action, ...item }) =>
                action === "category"
                  ? category.footItem(item.label)
                  : { ...item, onSelect: () => run[action](row) },
              )}
              footMenu={category.footMenu(row.name)}
              {...frame}
              // A dialog or menu the row's ⋮ opened holds focus itself.
              initialFocus={
                deletion === null && !category.open ? undefined : null
              }
            />
            {deletion === null ? null : (
              <PaneDeletion
                // Keyed by prompt: a refusal from the previous prompt can never
                // carry over to the next one.
                key={row.name}
                target={{ type: "prompt", name: row.name, ...deletion }}
                screen="prompts"
                onClose={() => setDeletion(null)}
                onDeleted={(written) => onDeleted(row.name, written)}
              />
            )}
          </>
        )}
      />
      {editFlow.open ? <ImportPromptDialog mode="edit" {...editFlow} /> : null}
    </>
  );
}
