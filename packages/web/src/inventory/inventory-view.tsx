import { ListFilter, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { UPDATE_TARGET } from "../deploy-state/update-target-copy";
import type { RegisteredRepo } from "../registry/use-registry";
import { cn } from "../ui/cn";
import { DataTable } from "../ui/data-table";
import { IconButton } from "../ui/icon-button";
import { Notice, type NoticeContent } from "../ui/notice";
import { OptionMenu } from "../ui/option-menu";
import { Panel } from "../ui/panel";
import { SelectionBar } from "../ui/selection-bar";
import { useReadAnnouncement } from "../ui/use-read-announcement";
import { BulkDeployAction } from "./bulk-deploy-action";
import { BulkRemoveSkillAction } from "./bulk-remove-skill-action";
import { bulkRemoveTargets } from "./bulk-remove-targets";
import {
  hiddenStagedCount,
  setStagedMany,
  toggleStaged,
} from "./bulk-selection";
import { DeploySkillAction } from "./deploy-skill-action";
import {
  behindTarget,
  type DeploymentTarget,
  rollUpDeployment,
} from "./deployed-rollup";
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
  REMOVE_SKILL,
  REREAD_LABEL,
  SEARCH_LABEL,
  SELECT_ALL_LABEL,
  STAGE_COLUMN_LABEL,
  stageRowLabel,
  TABLE_LABEL,
} from "./inventory-copy";
import { filterByName } from "./inventory-table-model";
import type { RowAction } from "./row-menu";
import { skillDeployments } from "./skill-deployments";
import { SkillDetailPane } from "./skill-detail-pane";
import { skillStatus } from "./skill-status";
import {
  deriveTypeSegments,
  filterByType,
  type TypeFilter,
} from "./type-filter";
import type { Primitive } from "./use-inventory";

// Presentational; the reads come from inventory-panel.tsx (#992, #1040).

// Fills the table at 1440×900 on a first read, before any row is known.
const SKELETON_FALLBACK = 24;

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
}: {
  /** Undefined until the Inventory has been read once. */
  primitives: Primitive[] | undefined;
  repos: RegisteredRepo[];
  registryReady: boolean;
  // Every deploy target, for the per-row status and reach (#272). Empty until
  // reads resolve — the roll-up treats that as unconfirmed.
  targets: DeploymentTarget[];
  /** A failed read; the previous rows stay under it (ADR-0033 §11). */
  notice: NoticeContent | null;
  /** Skeleton rows are up (use-read-skeleton.ts). */
  loading: boolean;
  /** A read is running, shown or not. */
  reading: boolean;
  onReread: () => void;
  // The one step that fills an empty Inventory. Supplied by the container, so
  // this component stays routerless and storyable.
  onOpenHarness?: () => void;
}) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [grouping, setGrouping] = useState<Grouping>("none");
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  // Held by name (from the full inventory), so a search narrowing the table
  // never closes an already-open pane (ADR-0016).
  const [selected, setSelected] = useState<string | null>(null);
  // What the row's ⋮ menu asked the pane for. A fresh nonce remounts the
  // pane's actions, so asking twice acts twice.
  const [intent, setIntent] = useState<{
    action: RowAction;
    nonce: number;
  } | null>(null);
  // The table's rows as it shows them, which the pane pages through.
  const [order, setOrder] = useState<string[]>([]);
  // Kept apart from `selected` so inspecting and staging never toggle each
  // other (Model A, #291).
  const [staged, setStaged] = useState<ReadonlySet<string>>(new Set());
  const gridRef = useRef<HTMLTableElement>(null);
  const getTriggerElement = useCallback(() => gridRef.current, []);

  const open = useCallback(
    (name: string | null, action: RowAction | null = null) => {
      setSelected(name);
      setIntent((current) =>
        action === null ? null : { action, nonce: (current?.nonce ?? 0) + 1 },
      );
    },
    [],
  );
  const cardColumn = hidden.has("status") ? "targets" : "status";
  const columns = useMemo(
    () =>
      inventoryColumns({
        cardColumn,
        onAction: (row, action) => open(row.name, action),
      }),
    [cardColumn, open],
  );

  const announcement = useReadAnnouncement("Inventory", loading, notice);

  const all = primitives ?? [];
  const rows: InventoryRow[] = all.map((primitive) => {
    const rollup = rollUpDeployment(primitive.name, targets);
    const status = skillStatus(rollup);
    return {
      ...primitive,
      status,
      targets: status === null ? null : rollup.targetCount,
      deployments: skillDeployments(primitive.name, targets),
      unreadable: Boolean(rollup.unreadable),
      // The same offers the pane makes, so the two never disagree.
      actions: [
        { action: "deploy", label: DEPLOY_SKILL },
        ...(status !== null && behindTarget(primitive.name, targets)
          ? [{ action: "update" as const, label: UPDATE_TARGET }]
          : []),
        ...(bulkRemoveTargets(primitive.name, targets).length >= 2
          ? [{ action: "remove" as const, label: REMOVE_SKILL }]
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
  const selectedRollup = selectedPrimitive
    ? rollUpDeployment(selectedPrimitive.name, targets)
    : null;
  // Two or more, or the bulk would duplicate a remove that already exists on
  // the one target (#422).
  const removable = selectedPrimitive
    ? bulkRemoveTargets(selectedPrimitive.name, targets)
    : [];
  const openIndex = selected === null ? -1 : order.indexOf(selected);
  const actionKey = `${selected}:${intent?.nonce ?? 0}`;

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
          className="h-control w-full rounded-control border border-gray-9 bg-gray-1 pr-inline pl-7 font-ui text-gray-12 text-row placeholder:text-dim"
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
          <div className="absolute inset-y-0 right-0 z-20 max-w-full shadow-float min-[1100px]:static min-[1100px]:shadow-none">
            <SkillDetailPane
              primitive={selectedPrimitive}
              deployments={skillDeployments(selectedPrimitive.name, targets)}
              unconfirmed={Boolean(
                selectedRollup?.pending || selectedRollup?.unreadable,
              )}
              position={
                openIndex === -1
                  ? null
                  : { index: openIndex, count: order.length }
              }
              onPage={(step) => open(order[openIndex + step] ?? selected)}
              // Deploy skill starts at the target picker; Update target and
              // Remove skill open a dialog that holds focus itself.
              initialFocus={
                intent === null
                  ? undefined
                  : intent.action === "deploy"
                    ? "select"
                    : null
              }
              deployAction={
                // Keyed by skill: a pending pick or refusal from the previous
                // skill can never carry over and overwrite the next one (#66).
                <DeploySkillAction
                  key={actionKey}
                  skillName={selectedPrimitive.name}
                  repos={repos}
                  registryReady={registryReady}
                  intent={intent?.action === "update" ? "update" : undefined}
                  initialTarget={
                    intent?.action === "update"
                      ? behindTarget(selectedPrimitive.name, targets)
                      : undefined
                  }
                />
              }
              removeAction={
                removable.length >= 2 ? (
                  <BulkRemoveSkillAction
                    key={actionKey}
                    skillName={selectedPrimitive.name}
                    targets={removable}
                    defaultOpen={intent?.action === "remove"}
                  />
                ) : null
              }
              onClose={() => open(null)}
              getTriggerElement={getTriggerElement}
            />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
