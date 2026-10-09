import type { SkillDeletionCheck } from "@maestro/core";
import { Search, Table2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { DELETE_UNAVAILABLE } from "../harness/dialog-copy";
import { folderInClone } from "../harness/use-harness";
import type { RegisteredRepo } from "../registry/use-registry";
import type { ActionsMenuItem } from "../ui/actions-menu";
import { Button } from "../ui/button";
import { DELETE_SKILL, UPDATE_TARGET } from "../ui/control-labels";
import { Icon } from "../ui/icon";
import { SelectionBar } from "../ui/selection-bar";
import { TableScreen } from "../ui/table-screen";
import { useNow } from "../ui/use-now";
import { type ReadFailure, useTableScreen } from "../ui/use-table-screen";
import { useViewOptions } from "../ui/use-view-options";
import { BulkDeployAction } from "./bulk-deploy-action";
import { bulkRemoveTargets } from "./bulk-remove-targets";
import {
  hiddenStagedCount,
  setStagedMany,
  toggleStaged,
} from "./bulk-selection";
import { type DeploymentTarget, rollUpDeployment } from "./deployed-rollup";
import {
  DISPLAY_OPTIONS,
  type InventoryRow,
  inventoryColumns,
  type RowAction,
} from "./inventory-columns";
import {
  DEPLOY_SKILL,
  NO_FILTER_MATCH,
  NO_RELEASED_SKILLS,
  NO_SEARCH_MATCH,
  NO_SKILLS_YET,
  REMOVE_FROM_TARGET,
  removeFromAllLabel,
  removeFromToolsLabel,
  SEARCH_LABEL,
  SELECT_ALL_LABEL,
  SHOW_IN_DEPLOY_STATE,
  STAGE_COLUMN_LABEL,
  stageRowLabel,
} from "./inventory-copy";
import {
  type SkillDeployment,
  skillDeployments,
  skillReadAge,
} from "./skill-deployments";
import { SkillDetailPane } from "./skill-detail-pane";
import { type PaneDialog, SkillPaneDialog } from "./skill-pane-dialogs";
import {
  BEHIND,
  NOT_DEPLOYED,
  skillStatus,
  UNKNOWN,
  UP_TO_DATE,
} from "./skill-status";
import { filterByName, TYPE_LABEL, typeOptions } from "./type-filter";
import type { Primitive } from "./use-inventory";

// Presentational; the container supplies the reads (#992, #1040).

// What this computer's clone says about deleting each skill (#1385).
export type CloneReading =
  | { kind: "no-harness" | "checking" | "failed" }
  | { kind: "read"; skills: Record<string, SkillDeletionCheck> };

const inClone = (clone: CloneReading, name: string) =>
  folderInClone(clone.kind === "read" ? clone.skills[name] : undefined);

// Last, as a danger item; blocked with its reason while the clone cannot
// take it.
const deleteItem = (clone: CloneReading, name: string) => {
  const reason =
    clone.kind !== "read"
      ? DELETE_UNAVAILABLE[clone.kind]
      : inClone(clone, name) === null
        ? DELETE_UNAVAILABLE["not-in-clone"]
        : null;
  return {
    action: "delete" as const,
    label: reason === null ? DELETE_SKILL : `${DELETE_SKILL} — ${reason}`,
    danger: true,
    disabled: reason !== null,
  };
};

// The row's ⋮ and the pane's foot open the same dialog per action (#1065).
const rowDialog = (
  action: RowAction,
  name: string,
  clone: CloneReading,
): PaneDialog => {
  switch (action) {
    case "deploy":
      return { kind: "deploy" };
    case "remove":
      return { kind: "remove-all" };
    case "delete":
      return {
        kind: "delete",
        localOnly: inClone(clone, name)?.localOnly ?? false,
      };
  }
};

// Worst first, as the Status sort orders them (#992).
const STATUS_WORDS = [BEHIND, UNKNOWN, UP_TO_DATE, NOT_DEPLOYED].map(
  (reading) => reading.word,
);

const BY_TYPE = {
  value: "type",
  label: "Type",
  groups: { key: (row: InventoryRow) => TYPE_LABEL[row.type] },
};

export function InventoryView({
  primitives,
  repos,
  registryReady,
  targets,
  failure,
  reading,
  onReread,
  onOpenHarness,
  onShowTarget,
  clone,
  onDeleted,
}: {
  /** Undefined until the Inventory has been read once. */
  primitives: Primitive[] | undefined;
  repos: RegisteredRepo[];
  registryReady: boolean;
  // Every deploy target, for the per-row status and reach (#272). Empty until
  // reads resolve — the roll-up treats that as unconfirmed.
  targets: DeploymentTarget[];
  /** A failed read; the previous rows stay under it. */
  failure: ReadFailure | null;
  /** A read is running, shown or not. */
  reading: boolean;
  onReread: () => void;
  // Supplied by the container, so this component stays routerless and storyable.
  onOpenHarness?: () => void;
  /** Opens a target's row on Deploy-state; absent where no router is. */
  onShowTarget?: (rowId: string) => void;
  /** Gates Delete skill on each row. */
  clone: CloneReading;
  /** Step 1 of a deletion landed; the next step is on the Harness view. */
  onDeleted: (skill: string) => void;
}) {
  const screen = useTableScreen({
    name: "Inventory",
    reading,
    settled: primitives !== undefined,
    failure,
    onReread,
    openOnArrival: null,
  });
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<PaneDialog | null>(null);
  // Apart from the open row, so inspecting and staging never toggle each other.
  const [staged, setStaged] = useState<ReadonlySet<string>>(new Set());

  // Opening a row any other way drops a menu item's dialog.
  const state = {
    ...screen,
    open: (name: string | null) => {
      setDialog(null);
      screen.open(name);
    },
  };
  const openFromMenu = useCallback(
    (name: string, action: RowAction) => {
      screen.open(name);
      setDialog(rowDialog(action, name, clone));
    },
    [screen.open, clone],
  );
  const listHeading = useRef<HTMLHeadingElement>(null);

  const now = useNow();
  const all = primitives ?? [];
  const rows: InventoryRow[] = all.map((primitive) => {
    const rollup = rollUpDeployment(primitive.name, targets);
    const status = skillStatus(rollup);
    const deployments = skillDeployments(primitive.name, targets);
    return {
      ...primitive,
      status,
      targets: status === null ? null : rollup.targetCount,
      deployments,
      unreadable: Boolean(rollup.unreadable),
      readAge: skillReadAge(primitive.name, targets, now),
      // The pane's foot holds these same items (#1065). The removal is offered only
      // from two targets, or it would repeat a target row's own (#422).
      actions: [
        { action: "deploy", label: DEPLOY_SKILL },
        ...(bulkRemoveTargets(primitive.name, targets).length >= 2
          ? [
              {
                action: "remove" as const,
                label: removeFromAllLabel(deployments.length),
                danger: true,
              },
            ]
          : []),
        deleteItem(clone, primitive.name),
      ],
    };
  });

  const view = useViewOptions(rows, {
    kind: {
      label: "Type",
      options: typeOptions(all),
      of: (row) => row.type,
    },
    status: {
      words: STATUS_WORDS,
      of: (row) => row.status?.word ?? null,
    },
    groupings: [BY_TYPE],
    initialGrouping: "none",
    columns: DISPLAY_OPTIONS,
    unavailable: NO_SKILLS_YET,
  });

  const columns = useMemo(
    () =>
      inventoryColumns({
        onAction: (row, action) => openFromMenu(row.name, action),
      }),
    [openFromMenu],
  );

  const matched = new Set(filterByName(rows, query).map((row) => row.name));
  const searched = (row: InventoryRow) => matched.has(row.name);

  const targetItems = (deployment: SkillDeployment): ActionsMenuItem[] => {
    const { rowId } = deployment;
    return [
      ...(deployment.updatable
        ? [
            {
              label: UPDATE_TARGET,
              onSelect: () => setDialog({ kind: "update", deployment }),
            },
          ]
        : []),
      ...(onShowTarget === undefined || rowId === null
        ? []
        : [
            {
              label: SHOW_IN_DEPLOY_STATE,
              onSelect: () => onShowTarget(rowId),
            },
          ]),
      {
        label:
          deployment.removeTarget.kind === "global"
            ? removeFromToolsLabel(deployment.removeTarget.tools)
            : REMOVE_FROM_TARGET,
        danger: true,
        onSelect: () => setDialog({ kind: "remove", deployment }),
      },
    ];
  };

  return (
    <TableScreen
      state={state}
      meta={
        primitives === undefined
          ? undefined
          : `${all.length} ${all.length === 1 ? "skill" : "skills"}`
      }
      lead={
        <div className="relative min-w-0 max-w-60 flex-1">
          <Icon
            of={Search}
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-inline text-gray-11"
          />
          <input
            type="search"
            aria-label={SEARCH_LABEL}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={SEARCH_LABEL}
            className="h-control w-full rounded-control border border-gray-9 bg-gray-1 pr-inline pl-7 font-ui text-gray-12 text-row placeholder:text-gray-11"
          />
        </div>
      }
      rereading={screen.reading}
      firstReadRows={24}
      rows={rows}
      columns={columns}
      rowId={(row) => row.name}
      shown={searched}
      view={view}
      noMatch={view.filterCount > 0 ? NO_FILTER_MATCH : NO_SEARCH_MATCH}
      empty={{
        ...NO_RELEASED_SKILLS,
        icon: <Icon of={Table2} />,
        action:
          onOpenHarness === undefined ? undefined : (
            <Button variant="quiet" onClick={onOpenHarness}>
              Open Harness
            </Button>
          ),
      }}
      selection={{
        label: STAGE_COLUMN_LABEL,
        allLabel: SELECT_ALL_LABEL,
        rowLabel: (row) => stageRowLabel(row.name),
        selected: staged,
        onToggle: (row) =>
          setStaged((current) => toggleStaged(current, row.name)),
        onSetSelected: (many, select) =>
          setStaged((current) =>
            setStagedMany(
              current,
              many.map((row) => row.name),
              select,
            ),
          ),
      }}
      // Rises with the first choice and leaves with the last (#992).
      selectionBar={
        staged.size > 0 ? (
          <SelectionBar
            count={staged.size}
            hiddenCount={hiddenStagedCount(
              staged,
              rows
                .filter((row) => searched(row) && view.shown(row))
                .map((row) => row.name),
            )}
            onClear={() => setStaged(new Set())}
          >
            <BulkDeployAction
              stagedNames={[...staged]}
              repos={repos}
              registryReady={registryReady}
              onSelectionSpent={() => setStaged(new Set())}
            />
          </SelectionBar>
        ) : null
      }
      pane={(row, frame) => {
        const rollup = rollUpDeployment(row.name, targets);
        return (
          <>
            <SkillDetailPane
              primitive={row}
              targetCount={row.targets}
              deployments={row.deployments}
              pending={Boolean(rollup.pending)}
              unreadable={row.unreadable}
              listHeadingRef={listHeading}
              {...frame}
              // A dialog the row's ⋮ opened holds focus itself.
              initialFocus={dialog === null ? undefined : null}
              targetItems={targetItems}
              footItems={row.actions.map((item) => ({
                label: item.label,
                danger: item.danger,
                disabled: item.disabled,
                onSelect: () =>
                  setDialog(rowDialog(item.action, row.name, clone)),
              }))}
            />
            {dialog === null ? null : (
              <SkillPaneDialog
                // Keyed by skill: a refusal from the previous skill can never
                // carry over and overwrite the next one (#66).
                key={row.name}
                dialog={dialog}
                skillName={row.name}
                repos={repos}
                registryReady={registryReady}
                removable={bulkRemoveTargets(row.name, targets)}
                onClose={() => setDialog(null)}
                // The row that opened it is gone, so focus goes to its list.
                onRemoved={() => {
                  setDialog(null);
                  requestAnimationFrame(() => listHeading.current?.focus());
                }}
                onDeleted={() => onDeleted(row.name)}
              />
            )}
          </>
        );
      }}
    />
  );
}
