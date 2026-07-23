import { type ReactNode, useState } from "react";
import { RegisterRepoHint } from "../registry/register-repo-hint";
import type { RegisteredRepo } from "../registry/use-registry";
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
      <div className="px-card-x pt-row-y">
        <SegmentedControl
          label="Filter by type"
          segments={segments}
          value={filter}
          onChange={setFilter}
        />
      </div>
      <div className="px-card-x py-row-y">
        <label htmlFor="inventory-search" className="sr-only">
          Search skills
        </label>
        <input
          id="inventory-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search skills…"
          className="w-full rounded-control border border-line bg-inset px-card-x py-row-y font-mono text-fg text-mono-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-dim text-tag">
                No skills match your search.
              </TableCell>
            </TableRow>
          ) : (
            visible.map((primitive) => (
              <TableRow
                key={primitive.name}
                className={
                  primitive.name === selected ? "bg-dim-bg" : undefined
                }
              >
                <TableCell>
                  <TypeTag type={primitive.type} />
                </TableCell>
                <TableCell className="truncate font-mono text-data text-fg">
                  {/* The name is the row's select control: it opens the detail
                      pane, the "do" surface deploy moved into (ADR-0016). A real
                      button keeps it keyboard-reachable and toggles the pane. */}
                  <button
                    type="button"
                    onClick={() =>
                      setSelected((current) =>
                        current === primitive.name ? null : primitive.name,
                      )
                    }
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
            <DeploySkillAction
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
