import { ListFilter, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RegisteredRepo } from "../registry/use-registry";
import { createDataTableColumns, DataTable } from "../ui/data-table";
import { IconButton } from "../ui/icon-button";
import { Notice, type NoticeContent } from "../ui/notice";
import { OptionMenu } from "../ui/option-menu";
import { Panel } from "../ui/panel";
import { StatusBadge } from "../ui/status-badge";
import { readingRank, type StatusReading } from "../ui/status-reading";
import { useReadAnnouncement } from "../ui/use-read-announcement";
import { BulkDeployBar } from "./bulk-deploy-bar";
import { BulkRemoveSkillAction } from "./bulk-remove-skill-action";
import { bulkRemoveTargets } from "./bulk-remove-targets";
import { hiddenStagedCount, toggleStaged } from "./bulk-selection";
import { DeploySkillAction } from "./deploy-skill-action";
import { type DeploymentTarget, rollUpDeployment } from "./deployed-rollup";
import {
  DISPLAY_LABEL,
  FILTER_LABEL,
  NO_FILTER_MATCH,
  NO_RELEASED_SKILLS,
  NO_SEARCH_MATCH,
  NO_SKILLS_YET,
  REREAD_LABEL,
  SEARCH_LABEL,
  STAGE_COLUMN_LABEL,
  stageRowLabel,
  TABLE_LABEL,
} from "./inventory-copy";
import { filterByName } from "./inventory-table-model";
import { skillDeployments } from "./skill-deployments";
import { SkillDetailPane } from "./skill-detail-pane";
import {
  BEHIND,
  NOT_DEPLOYED,
  skillStatus,
  UNKNOWN,
  UP_TO_DATE,
} from "./skill-status";
import {
  deriveTypeSegments,
  filterByType,
  TYPE_WORD,
  type TypeFilter,
} from "./type-filter";
import type { Primitive } from "./use-inventory";

// Presentational; the reads come from inventory-panel.tsx (#992, #1040).

type InventoryRow = Primitive & {
  status: StatusReading | null;
  // Null while the status is unconfirmed, so a partial reach never shows.
  targets: number | null;
};

const unranked = Number.MAX_SAFE_INTEGER;
// Fills the table at 1440×900 on a first read, before any row is known.
const SKELETON_FALLBACK = 24;

const columns = createDataTableColumns<InventoryRow>((helper) => [
  helper.accessor("type", {
    header: "Type",
    cell: ({ row }) => TYPE_WORD[row.original.type],
    meta: { className: "w-16 text-gray-11" },
  }),
  helper.accessor("name", {
    header: "Name",
    meta: { className: "w-55 font-medium text-gray-12" },
  }),
  helper.accessor("description", {
    header: "Description",
    // Drops out first on a narrow window (#992).
    meta: { className: "text-gray-11 @max-[45rem]:hidden" },
  }),
  helper.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => {
      const status = getValue();
      return status === null ? null : <StatusBadge reading={status} />;
    },
    sortFn: (a, b) =>
      (a.original.status ? readingRank(a.original.status) : unranked) -
      (b.original.status ? readingRank(b.original.status) : unranked),
    meta: { className: "w-33" },
  }),
  helper.accessor("targets", {
    header: "Targets",
    cell: ({ getValue }) => {
      const targets = getValue();
      return targets === null ? null : targets === 0 ? "—" : targets;
    },
    sortFn: (a, b) => (a.original.targets ?? -1) - (b.original.targets ?? -1),
    meta: { className: "w-18 tabular-nums text-gray-12", align: "end" },
  }),
]);

const STATUS_OPTIONS = [UP_TO_DATE, BEHIND, UNKNOWN, NOT_DEPLOYED].map(
  (reading) => ({ value: reading.word, label: reading.word }),
);

const DISPLAY_OPTIONS = [
  { value: "type", label: "Type" },
  { value: "description", label: "Description" },
  { value: "status", label: "Status" },
  { value: "targets", label: "Targets" },
];

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
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  // Held by name (from the full inventory), so a search narrowing the table
  // never closes an already-open pane (ADR-0016).
  const [selected, setSelected] = useState<string | null>(null);
  // Kept apart from `selected` so inspecting and staging never toggle each
  // other (Model A, #291).
  const [staged, setStaged] = useState<ReadonlySet<string>>(new Set());
  const gridRef = useRef<HTMLTableElement>(null);
  const getTriggerElement = useCallback(() => gridRef.current, []);
  // On a narrow window the pane sits below the table — bring it into view.
  const paneRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected === null) return;
    paneRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const announcement = useReadAnnouncement("Inventory", loading, notice);

  const all = primitives ?? [];
  const rows: InventoryRow[] = all.map((primitive) => {
    const rollup = rollUpDeployment(primitive.name, targets);
    const status = skillStatus(rollup);
    return {
      ...primitive,
      status,
      targets: status === null ? null : rollup.targetCount,
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
      {/* Side by side only ~1200px+; narrower, the pane drops below the table
          and the panel content scrolls instead of the table. */}
      <div className="flex flex-col min-[1200px]:h-[100cqh] min-[1200px]:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
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
          {/* Staging is what makes a bulk run possible, so the strip appears
              with the first checkbox and retires with the last. */}
          {staged.size > 0 ? (
            <BulkDeployBar
              stagedNames={[...staged]}
              hiddenCount={hiddenStagedCount(
                staged,
                visible.map((row) => row.name),
              )}
              repos={repos}
              registryReady={registryReady}
            />
          ) : null}
          {showTable ? (
            <div
              aria-busy={reading || undefined}
              // Rows scroll here, not the page, so the header stays put.
              className="min-h-0 flex-1 overflow-auto"
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
                openRowId={selected}
                onRowOpen={(row) =>
                  setSelected((current) =>
                    current === row.name ? null : row.name,
                  )
                }
                selection={{
                  label: STAGE_COLUMN_LABEL,
                  rowLabel: (row) => stageRowLabel(row.name),
                  selected: staged,
                  onToggle: (row) =>
                    setStaged((current) => toggleStaged(current, row.name)),
                }}
                empty={filterCount > 0 ? NO_FILTER_MATCH : NO_SEARCH_MATCH}
              />
            </div>
          ) : null}
        </div>
        {selectedPrimitive ? (
          <SkillDetailPane
            ref={paneRef}
            primitive={selectedPrimitive}
            deployments={skillDeployments(selectedPrimitive.name, targets)}
            unconfirmed={Boolean(
              selectedRollup?.pending || selectedRollup?.unreadable,
            )}
            deployAction={
              // Keyed by skill: a pending pick or refusal from the previous
              // skill can never carry over and overwrite the next one (#66).
              <DeploySkillAction
                key={selectedPrimitive.name}
                skillName={selectedPrimitive.name}
                repos={repos}
                registryReady={registryReady}
              />
            }
            removeAction={
              removable.length >= 2 ? (
                <BulkRemoveSkillAction
                  key={selectedPrimitive.name}
                  skillName={selectedPrimitive.name}
                  targets={removable}
                />
              ) : null
            }
            onClose={() => setSelected(null)}
            getTriggerElement={getTriggerElement}
          />
        ) : null}
      </div>
    </Panel>
  );
}
