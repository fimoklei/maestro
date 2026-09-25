import { ListFilter, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { UPDATE_TARGET } from "../deploy-state/update-target-copy";
import type { RegisteredRepo } from "../registry/use-registry";
import type { ActionsMenuItem } from "../ui/actions-menu";
import { cn } from "../ui/cn";
import { DataTable } from "../ui/data-table";
import { DetailPaneSlot } from "../ui/detail-pane";
import { IconButton } from "../ui/icon-button";
import { Notice, type NoticeContent } from "../ui/notice";
import { OptionMenu } from "../ui/option-menu";
import { Panel } from "../ui/panel";
import { SelectionBar } from "../ui/selection-bar";
import { useReadAnnouncement } from "../ui/use-read-announcement";
import { useStatusRegion } from "../ui/use-status-region";
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
  GROUP_OPTIONS,
  type Grouping,
  groupsFor,
  type InventoryRow,
  inventoryColumns,
  STATUS_OPTIONS,
} from "./inventory-columns";
import {
  DEPLOY_SKILL,
  DISPLAY_LABEL,
  FILTER_LABEL,
  NO_FILTER_MATCH,
  NO_RELEASED_SKILLS,
  NO_SEARCH_MATCH,
  NO_SKILLS_YET,
  REMOVE_FROM_TARGET,
  REREAD_LABEL,
  removeFromAllLabel,
  removeFromToolsLabel,
  SEARCH_LABEL,
  SELECT_ALL_LABEL,
  SHOW_IN_DEPLOY_STATE,
  STAGE_COLUMN_LABEL,
  stageRowLabel,
  TABLE_LABEL,
} from "./inventory-copy";
import { filterByName } from "./inventory-table-model";
import type { RowAction } from "./row-menu";
import { type SkillDeployment, skillDeployments } from "./skill-deployments";
import { SkillDetailPane } from "./skill-detail-pane";
import { type PaneDialog, SkillPaneDialog } from "./skill-pane-dialogs";
import { skillStatus } from "./skill-status";
import {
  deriveTypeSegments,
  filterByType,
  type TypeFilter,
} from "./type-filter";
import type { Primitive } from "./use-inventory";

// Presentational; the container supplies the reads (#992, #1040).

// Fills the table at 1440×900 on a first read, before any row is known.
const SKELETON_FALLBACK = 24;

// The row's ⋮ and the pane's foot open the same dialog per action (#1065).
const rowDialog = (action: RowAction): PaneDialog =>
  action === "deploy" ? { kind: "deploy" } : { kind: "remove-all" };

export function InventoryView({
  primitives,
  repos,
  registryReady,
  targets,
  notice,
  loading,
  reading,
  onReread,
  onOpenHarness,
  onShowTarget,
}: {
  /** Undefined until the Inventory has been read once. */
  primitives: Primitive[] | undefined;
  repos: RegisteredRepo[];
  registryReady: boolean;
  // Every deploy target, for the per-row status and reach (#272). Empty until
  // reads resolve — the roll-up treats that as unconfirmed.
  targets: DeploymentTarget[];
  /** A failed read; the previous rows stay under it. */
  notice: NoticeContent | null;
  /** Skeleton rows are up. */
  loading: boolean;
  /** A read is running, shown or not. */
  reading: boolean;
  onReread: () => void;
  // Supplied by the container, so this component stays routerless and storyable.
  onOpenHarness?: () => void;
  /** Opens a target's row on Deploy-state; absent where no router is. */
  onShowTarget?: (rowId: string) => void;
}) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [grouping, setGrouping] = useState<Grouping>("none");
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  // Held by name, so a search narrowing the table never closes an open pane.
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<PaneDialog | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  // Apart from `selected`, so inspecting and staging never toggle each other.
  const [staged, setStaged] = useState<ReadonlySet<string>>(new Set());
  const gridRef = useRef<HTMLTableElement>(null);
  const getTriggerElement = useCallback(() => gridRef.current, []);

  const open = useCallback(
    (name: string | null, action: RowAction | null = null) => {
      setSelected(name);
      setDialog(action === null ? null : rowDialog(action));
    },
    [],
  );
  const listHeading = useRef<HTMLHeadingElement>(null);
  const cardColumn = hidden.has("status") ? "targets" : "status";
  const columns = useMemo(
    () =>
      inventoryColumns({
        cardColumn,
        onAction: (row, action) => open(row.name, action),
      }),
    [cardColumn, open],
  );

  const [announcement] = useStatusRegion(
    useReadAnnouncement("Inventory", loading, notice),
  );

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
      ],
    };
  });
  const filterCount = (typeFilter === "all" ? 0 : 1) + statusFilter.size;
  const visible = filterByName(filterByType(rows, typeFilter), query).filter(
    (row) =>
      statusFilter.size === 0 ||
      (row.status !== null && statusFilter.has(row.status.word)),
  );

  const selectedPrimitive =
    selected === null
      ? null
      : (all.find((primitive) => primitive.name === selected) ?? null);
  const selectedRow = rows.find((row) => row.name === selected) ?? null;
  const selectedRollup = selectedPrimitive
    ? rollUpDeployment(selectedPrimitive.name, targets)
    : null;
  const removable = selectedPrimitive
    ? bulkRemoveTargets(selectedPrimitive.name, targets)
    : [];
  const openIndex = selected === null ? -1 : order.indexOf(selected);
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

  const noSkills = all.length === 0 ? NO_SKILLS_YET : undefined;
  const band2 = (
    <>
      <div className="relative min-w-0 max-w-60 flex-1">
        <Search
          aria-hidden="true"
          strokeWidth={1.5}
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-inline size-4 text-gray-11"
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
      <div className="ml-auto flex items-center gap-inline">
        <IconButton label={REREAD_LABEL} onClick={onReread}>
          <RefreshCw aria-hidden="true" strokeWidth={1.5} className="size-4" />
        </IconButton>
        <OptionMenu
          label={FILTER_LABEL}
          unavailable={noSkills}
          count={filterCount}
          icon={
            <ListFilter
              aria-hidden="true"
              strokeWidth={1.5}
              className="size-4"
            />
          }
          sections={[
            {
              kind: "radio",
              label: "Type",
              options: deriveTypeSegments(all),
              value: typeFilter,
              onChange: (value) => setTypeFilter(value as TypeFilter),
            },
            {
              kind: "check",
              label: "Status",
              options: STATUS_OPTIONS,
              values: statusFilter,
              onToggle: (value) =>
                setStatusFilter((current) => toggleStaged(current, value)),
            },
          ]}
        />
        <OptionMenu
          label={DISPLAY_LABEL}
          unavailable={noSkills}
          icon={
            <SlidersHorizontal
              aria-hidden="true"
              strokeWidth={1.5}
              className="size-4"
            />
          }
          sections={[
            {
              kind: "radio",
              label: "Group by",
              options: GROUP_OPTIONS,
              value: grouping,
              onChange: (value) => setGrouping(value as Grouping),
            },
            {
              kind: "check",
              label: "Columns",
              options: DISPLAY_OPTIONS,
              values: new Set(
                DISPLAY_OPTIONS.map((option) => option.value).filter(
                  (value) => !hidden.has(value),
                ),
              ),
              onToggle: (value) =>
                setHidden((current) => toggleStaged(current, value)),
            },
          ]}
        />
      </div>
    </>
  );

  const showTable = loading || all.length > 0;

  return (
    <Panel
      title="Inventory"
      meta={
        primitives === undefined
          ? undefined
          : `${all.length} ${all.length === 1 ? "skill" : "skills"}`
      }
      band2={band2}
    >
      {/* Mounted before any read, so its first announcement is heard. */}
      <div
        role="status"
        data-testid="inventory-status-region"
        className="sr-only"
      >
        {announcement}
      </div>
      {/* Side by side from 1100px; narrower, the pane floats over the table as
          a sheet, never a block under it (#992). */}
      <div className="relative flex h-[100cqh]">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {/* A failed read is always trigger="load" — nothing here followed a
              click (#465). The region outlives its content. */}
          <div className={notice ? "p-panel" : undefined}>
            <Notice trigger="load" notice={notice} />
          </div>
          {primitives !== undefined && all.length === 0 && !loading ? (
            <div className="p-panel">
              <Notice
                trigger="load"
                notice={
                  onOpenHarness === undefined
                    ? NO_RELEASED_SKILLS
                    : {
                        ...NO_RELEASED_SKILLS,
                        action: {
                          label: "Open Harness",
                          onClick: onOpenHarness,
                        },
                      }
                }
              />
            </div>
          ) : null}
          {showTable ? (
            <div
              aria-busy={reading || undefined}
              // Rows scroll here, not the page, so the header stays put. Room
              // under the last row while the selection bar floats over it.
              className={cn(
                "min-h-0 flex-1 overflow-auto",
                // Bar height plus its offset: section + page + inline.
                staged.size > 0 &&
                  "pb-[calc(var(--spacing-section)+var(--spacing-page)+var(--spacing-inline))]",
              )}
            >
              <DataTable
                ref={gridRef}
                label={TABLE_LABEL}
                columns={columns}
                data={visible}
                getRowId={(row) => row.name}
                loading={loading}
                // The shape of what was there, so the table does not jump.
                skeletonRows={Math.min(all.length || SKELETON_FALLBACK, 30)}
                columnVisibility={Object.fromEntries(
                  [...hidden].map((id) => [id, false]),
                )}
                groups={groupsFor(grouping)}
                openRowId={selected}
                onRowOpen={(row) =>
                  open(selected === row.name ? null : row.name)
                }
                onRowOrderChange={setOrder}
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
                empty={filterCount > 0 ? NO_FILTER_MATCH : NO_SEARCH_MATCH}
              />
            </div>
          ) : null}
          {/* Rises with the first choice and leaves with the last; it floats
              over the table's foot, never above it (#992). */}
          {staged.size > 0 ? (
            <SelectionBar
              count={staged.size}
              hiddenCount={hiddenStagedCount(
                staged,
                visible.map((row) => row.name),
              )}
              onClear={() => setStaged(new Set())}
            >
              <BulkDeployAction
                stagedNames={[...staged]}
                repos={repos}
                registryReady={registryReady}
              />
            </SelectionBar>
          ) : null}
        </div>
        {selectedPrimitive ? (
          <DetailPaneSlot>
            <SkillDetailPane
              primitive={selectedPrimitive}
              targetCount={selectedRow?.targets ?? null}
              deployments={selectedRow?.deployments ?? []}
              unconfirmed={Boolean(
                selectedRollup?.pending || selectedRollup?.unreadable,
              )}
              listHeadingRef={listHeading}
              position={
                openIndex === -1
                  ? null
                  : { index: openIndex, count: order.length }
              }
              onPage={(step) => open(order[openIndex + step] ?? selected)}
              // A dialog the row's ⋮ opened holds focus itself.
              initialFocus={dialog === null ? undefined : null}
              targetItems={targetItems}
              footItems={(selectedRow?.actions ?? []).map((item) => ({
                label: item.label,
                danger: item.danger,
                onSelect: () => setDialog(rowDialog(item.action)),
              }))}
              onClose={() => open(null)}
              getTriggerElement={getTriggerElement}
            />
            {dialog === null ? null : (
              <SkillPaneDialog
                // Keyed by skill: a refusal from the previous skill can never
                // carry over and overwrite the next one (#66).
                key={selectedPrimitive.name}
                dialog={dialog}
                skillName={selectedPrimitive.name}
                repos={repos}
                registryReady={registryReady}
                removable={removable}
                onClose={() => setDialog(null)}
                // The row that opened it is gone, so focus goes to its list.
                onRemoved={() => {
                  setDialog(null);
                  requestAnimationFrame(() => listHeading.current?.focus());
                }}
              />
            )}
          </DetailPaneSlot>
        ) : null}
      </div>
    </Panel>
  );
}
