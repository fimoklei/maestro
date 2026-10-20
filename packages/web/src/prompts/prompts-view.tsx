import type { InventoryPrompt } from "@maestro/core";
import { useMutation } from "@tanstack/react-query";
import { MessageSquare, Table2, Tag } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { filterByName } from "../inventory/type-filter";
import type { HarnessFacts } from "../skills/skills-band";
import {
  NOT_RELEASED_YET,
  ORIGIN_FACT,
  RELEASE_FACT,
  UNKNOWN_FACT_VALUE,
} from "../ui/band-copy";
import { Button } from "../ui/button";
import { COPY_PROMPT } from "../ui/control-labels";
import { type Reading, readFreshness, useFreshnessLine } from "../ui/freshness";
import { GitHubMark } from "../ui/github-mark-link";
import { Icon } from "../ui/icon";
import { named, phrase } from "../ui/phrase";
import { TableScreen } from "../ui/table-screen";
import { type ReadFailure, useTableScreen } from "../ui/use-table-screen";
import { useViewOptions } from "../ui/use-view-options";
import { useWriteAction } from "../ui/use-write-action";
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
  type PromptRow,
  promptsColumns,
} from "./prompts-columns";
import {
  FINDING_LABEL,
  NAME_NOT_VALID,
  NO_FILTER_MATCH,
  NO_PROMPTS_YET,
  NO_RELEASED_PROMPTS,
  NO_SEARCH_MATCH,
  PROMPTS_FACT,
  promptsFactValue,
  SEARCH_LABEL,
} from "./prompts-copy";

// Presentational; the container supplies the reads (#1598).
export function PromptsView({
  prompts,
  harness,
  reads,
  failure,
  reading,
  onReread,
  onOpenHarness,
}: {
  /** Undefined until the Inventory has been read once. */
  prompts: InventoryPrompt[] | undefined;
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
}) {
  const screen = useTableScreen({
    name: PROMPTS_FACT,
    reading,
    settled: prompts !== undefined,
    failure,
    onReread,
    openOnArrival: null,
  });
  const [query, setQuery] = useState("");
  // Without a clipboard (no secure context, no permission) the write rejects.
  const copying = useMutation({
    mutationFn: (prompt: InventoryPrompt) =>
      navigator.clipboard.writeText(prompt.text),
  });
  const copyWrite = useWriteAction(copying, {
    report: screen.report,
    action: "copy",
    show: "toast",
    name: (_done, prompt) => phrase`${named(prompt.name)}`,
    // The refusal is the pane's notice.
    failure: () => null,
  });
  // The prompt whose last copy the browser refused; its pane says so.
  const refused = copying.isError ? (copying.variables?.name ?? null) : null;
  const copy = (prompt: InventoryPrompt) =>
    copyWrite.run(prompt, { onError: () => screen.open(prompt.name) });
  // Columns built once: rebuilt cells would drop the focus ⋮ gets back.
  const copyRef = useRef(copy);
  copyRef.current = copy;

  const freshness = readFreshness(reads);
  // A hover card dates the reading it states.
  const readAge = useFreshnessLine(freshness);
  const all = prompts ?? [];
  const rows: PromptRow[] = all.map((prompt) => ({
    ...prompt,
    actions: [{ action: "copy", label: COPY_PROMPT }],
    readAge,
  }));

  const view = useViewOptions(rows, {
    kind: {
      label: FINDING_LABEL,
      options: [{ value: NAME_NOT_VALID, label: NAME_NOT_VALID }],
      of: (row) => (row.nameValid ? "" : NAME_NOT_VALID),
    },
    status: null,
    groupings: [],
    initialGrouping: "none",
    columns: DISPLAY_OPTIONS,
    unavailable: NO_PROMPTS_YET,
  });

  const columns = useMemo(
    () => promptsColumns({ onAction: (row) => copyRef.current(row) }),
    [],
  );

  const matched = new Set(filterByName(rows, query).map((row) => row.name));
  const searched = (row: PromptRow) => matched.has(row.name);
  const shownCount = rows.filter(
    (row) => searched(row) && view.shown(row),
  ).length;

  return (
    <TableScreen
      state={screen}
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
      pane={(row, frame) => (
        <PromptDetailPane
          prompt={row}
          latestRelease={harness?.latestRelease}
          copyRefused={refused === row.name}
          onCopy={() => copy(row)}
          {...frame}
        />
      )}
    />
  );
}
