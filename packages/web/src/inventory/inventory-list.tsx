import { type ReactNode, useState } from "react";
import { RegisterRepoHint } from "../registry/register-repo-hint";
import type { RegisteredRepo } from "../registry/use-registry";
import { cn } from "../ui/cn";
import { SegmentedControl } from "../ui/segmented-control";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { TypeTag } from "../ui/type-tag";
import { BulkDeployBar } from "./bulk-deploy-bar";
import { hiddenStagedCount, toggleStaged } from "./bulk-selection";
import { DeploySkillAction } from "./deploy-skill-action";
import { DeployedCell } from "./deployed-cell";
import { type DeploymentTarget, rollUpDeployment } from "./deployed-rollup";
import {
  filterByName,
  nextSort,
  type SortColumn,
  type SortState,
  sortPrimitives,
} from "./inventory-table-model";
import { skillDeployments } from "./skill-deployments";
import { SkillDetailPane } from "./skill-detail-pane";
import {
  deriveTypeSegments,
  filterByType,
  type TypeFilter,
} from "./type-filter";
import type { Primitive } from "./use-inventory";

// Deploy-aware table of central skills: type, name, description, and an actions
// cell with the row's deploy control (#285). Three narrowing controls sit above
// it: a data-driven type filter (#288) plus a name search box (#287), and the
// column headers sort the rows (#287). All three are local UI-state applied
// through pure models — the loaded inventory is never refetched, only narrowed
// and reordered on screen (frontend.md). The view stays type-aware (TypeTag
// carries the type) though only skills render today. Empty state is explicit so
// a correctly configured but empty inventory never shows a bare, ambiguous
// blank.
export function InventoryList({
  primitives,
  repos,
  registryReady,
  targets = [],
}: {
  primitives: Primitive[];
  repos: RegisteredRepo[];
  registryReady: boolean;
  // Every deploy target (each global tool + each registered repo), so each row
  // pivots the per-target reads into its own reach + drift roll-up (#272). The
  // container owns the query state; this list only presents it. Empty until the
  // deploy-state reads resolve — a skill then reads `not deployed` rather than a
  // blank, which the roll-up already treats as an unconfirmed, uncounted target.
  targets?: DeploymentTarget[];
}) {
  // Which type segment is selected — local UI-state, never server-state. A
  // segment only exists when its type has data, so any selection yields rows.
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  // null = loaded order; the table only reorders once the user clicks a header,
  // so it never jumps before being asked to sort.
  const [sort, setSort] = useState<SortState | null>(null);
  // The row whose detail pane is open — UI-state, never server-state. Null keeps
  // the table a pure scan surface until a row is picked (ADR-0016). Held by name
  // (from the full inventory), so a later search narrowing the table does not close
  // an already-open pane.
  const [selected, setSelected] = useState<string | null>(null);
  const toggleSelected = (name: string) =>
    setSelected((current) => (current === name ? null : name));
  // Which skills are staged for a bulk action — UI-state, held by name and kept
  // apart from `selected` so inspecting and staging never toggle each other
  // (Model A, #291). Independent of the narrowed view, so filtering never drops
  // a staged skill.
  const [staged, setStaged] = useState<ReadonlySet<string>>(new Set());
  const toggleStagedName = (name: string) =>
    setStaged((current) => toggleStaged(current, name));

  if (primitives.length === 0) {
    return (
      <p className="px-card-x py-row-y text-dim text-tag">
        No skills found in the inventory.
      </p>
    );
  }

  // Segments derive from the full inventory; the table body reads the narrowed
  // set. Filtering never touches the segment set, so a segment never vanishes
  // because it is the one selected. Type filter → name search → sort compose in
  // that order; the result is the same whichever narrows first.
  const segments = deriveTypeSegments(primitives);
  const narrowed = filterByName(filterByType(primitives, filter), query);
  const visible = sort ? sortPrimitives(narrowed, sort) : narrowed;
  // How many staged skills the current filter/search hides, so the bulk bar can
  // warn that a bulk action reaches beyond what is on screen (#291).
  const hiddenCount = hiddenStagedCount(
    staged,
    visible.map((primitive) => primitive.name),
  );

  // The open pane's skill, read from the full inventory so a narrowing search
  // never orphans the selection. skillDeployments is the per-target version lens
  // over the same targets the Deployed column counts (#290).
  const selectedPrimitive =
    selected === null
      ? null
      : (primitives.find((primitive) => primitive.name === selected) ?? null);
  const selectedRollup = selectedPrimitive
    ? rollUpDeployment(selectedPrimitive.name, targets)
    : null;

  const table = (
    <>
      {/* Every row's target picker offers Global and nothing else until a repo
          is registered, so say once — above the table, not per row — where repo
          targets come from. Gated on registryReady: an unread registry looks
          identical to an empty one (#37), and claiming "none registered"
          before it resolves would be a guess. */}
      {registryReady && repos.length === 0 ? (
        <RegisterRepoHint className="block px-card-x pt-row-y" />
      ) : null}
      {/* Search and type filter share one toolbar row: scan-by-name on the left,
          scope-by-type on the right (mockup 3a). Both stay local UI-state. */}
      <div className="flex flex-wrap items-center gap-3 px-card-x py-row-y">
        <div className="relative w-full max-w-[240px]">
          <label htmlFor="inventory-search" className="sr-only">
            Search skills
          </label>
          {/* Leading glyph clears the input's pl-7; pointer-events-none so it
              never steals the click focus from the field. */}
          <span
            aria-hidden="true"
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 text-dim text-mono-sm"
          >
            ⌕
          </span>
          <input
            id="inventory-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search…"
            className="w-full rounded-control border border-line bg-inset py-row-y pr-card-x pl-7 font-mono text-fg text-mono-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
          />
        </div>
        <SegmentedControl
          className="ml-auto"
          label="Filter by type"
          segments={segments}
          value={filter}
          onChange={setFilter}
        />
      </div>
      {staged.size > 0 ? (
        <BulkDeployBar
          stagedNames={[...staged]}
          hiddenCount={hiddenCount}
          repos={repos}
          registryReady={registryReady}
        />
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="sr-only">Stage for bulk</span>
            </TableHead>
            <SortableHead column="type" sort={sort} onSort={setSort}>
              Type
            </SortableHead>
            <SortableHead column="name" sort={sort} onSort={setSort}>
              Name
            </SortableHead>
            <SortableHead column="description" sort={sort} onSort={setSort}>
              Description
            </SortableHead>
            {/* Deployed is a per-skill roll-up, not a primitive field, so it is
                not a sort key (out of #289 scope) — a plain header. */}
            <TableHead>Deployed</TableHead>
            {/* Trailing chevron column: the row's expand affordance. */}
            <TableHead>
              <span className="sr-only">Expand</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-dim text-tag">
                No skills match your search.
              </TableCell>
            </TableRow>
          ) : (
            visible.map((primitive) => (
              <TableRow
                key={primitive.name}
                onClick={() => toggleSelected(primitive.name)}
                className={cn(
                  "cursor-pointer",
                  primitive.name === selected ? "bg-active" : undefined,
                )}
              >
                <TableCell>
                  {/* Staging is independent of opening the pane, so the checkbox
                      stops the click from bubbling to the row's select handler
                      (Model A, #291). */}
                  <input
                    type="checkbox"
                    checked={staged.has(primitive.name)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => toggleStagedName(primitive.name)}
                    aria-label={`Stage ${primitive.name} for bulk`}
                    className="size-4 accent-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                  />
                </TableCell>
                <TableCell>
                  <TypeTag type={primitive.type} />
                </TableCell>
                <TableCell className="truncate font-mono text-data text-fg">
                  {/* Clicking anywhere on the row opens the pane (#290); the name
                      stays a real button so keyboard users have a focusable
                      control. It stops propagation so a mouse click resolves to a
                      single toggle, not the button and the row both firing. */}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleSelected(primitive.name);
                    }}
                    aria-expanded={primitive.name === selected}
                    aria-controls={`skill-detail-${primitive.name}`}
                    className="truncate text-left text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                  >
                    {primitive.name}
                  </button>
                </TableCell>
                <TableCell className="truncate text-desc text-muted">
                  {primitive.description}
                </TableCell>
                <TableCell>
                  <DeployedCell
                    rollup={rollUpDeployment(primitive.name, targets)}
                  />
                </TableCell>
                {/* Chevron mirrors the row's selected state — amber when its
                    pane is open, dim otherwise. Decorative: the name button
                    already carries aria-expanded for assistive tech. */}
                <TableCell className="text-right">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "text-mono-sm",
                      primitive.name === selected ? "text-amber" : "text-dim",
                    )}
                  >
                    ›
                  </span>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
  );

  return (
    <div className="flex items-start">
      <div className="min-w-0 flex-1">{table}</div>
      {selectedPrimitive ? (
        <SkillDetailPane
          primitive={selectedPrimitive}
          deployments={skillDeployments(selectedPrimitive.name, targets)}
          // The reach is unconfirmed while any target's read is pending or
          // unreadable, so an empty "deployed to" list holds off on the definite
          // "not deployed" (J04) — the same signal the deployed cell reads.
          unconfirmed={Boolean(
            selectedRollup?.pending || selectedRollup?.unreadable,
          )}
          deployAction={
            // Keyed by skill so switching skills mounts a fresh action: a
            // pending pick or a forceable-reinstall refusal from the previous
            // skill can never carry over and overwrite the next one (#66).
            <DeploySkillAction
              key={selectedPrimitive.name}
              skillName={selectedPrimitive.name}
              repos={repos}
              registryReady={registryReady}
            />
          }
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}

// A clickable column header that drives the shared sort state. The active
// column carries aria-sort so the direction is announced to assistive tech and
// visible via the glyph — the "active sort is visible" acceptance signal (#287).
function SortableHead({
  column,
  sort,
  onSort,
  children,
}: {
  column: SortColumn;
  sort: SortState | null;
  onSort: (next: SortState) => void;
  children: ReactNode;
}) {
  const active = sort?.column === column ? sort.direction : null;
  const ariaSort =
    active === "asc" ? "ascending" : active === "desc" ? "descending" : "none";

  return (
    <TableHead ariaSort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, column))}
        className="flex items-center gap-1 font-mono text-tag uppercase tracking-tag text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
      >
        {children}
        <span aria-hidden="true" className="text-muted">
          {active === "asc" ? "↑" : active === "desc" ? "↓" : ""}
        </span>
      </button>
    </TableHead>
  );
}
