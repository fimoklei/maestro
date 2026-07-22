import { type ReactNode, useState } from "react";
import { RegisterRepoHint } from "../registry/register-repo-hint";
import type { RegisteredRepo } from "../registry/use-registry";
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
import {
  filterByName,
  nextSort,
  type SortColumn,
  type SortState,
  sortPrimitives,
} from "./inventory-table-model";
import type { Primitive } from "./use-inventory";

// Presentational table of central skills: type, name, description, and an
// actions cell with the row's deploy control (#285). Search and sort (#287) are
// UI-state owned here and applied through the pure model — the loaded inventory
// is never refetched, only narrowed and reordered on screen (frontend.md). The
// view stays type-aware (TypeTag carries the type) though only skills render
// today. Empty state is explicit so a correctly configured but empty inventory
// never shows a bare, ambiguous blank.
export function InventoryList({
  primitives,
  repos,
  registryReady,
}: {
  primitives: Primitive[];
  repos: RegisteredRepo[];
  registryReady: boolean;
}) {
  const [query, setQuery] = useState("");
  // null = loaded order; the table only reorders once the user clicks a header,
  // so it never jumps before being asked to sort.
  const [sort, setSort] = useState<SortState | null>(null);

  if (primitives.length === 0) {
    return (
      <p className="px-card-x py-row-y text-dim text-tag">
        No skills found in the inventory.
      </p>
    );
  }

  const filtered = filterByName(primitives, query);
  const visible = sort ? sortPrimitives(filtered, sort) : filtered;

  return (
    <>
      {/* Every row's target picker offers Global and nothing else until a repo
          is registered, so say once — above the table, not per row — where repo
          targets come from. Gated on registryReady: an unread registry looks
          identical to an empty one (#37), and claiming "none registered"
          before it resolves would be a guess. */}
      {registryReady && repos.length === 0 ? (
        <RegisterRepoHint className="block px-card-x pt-row-y" />
      ) : null}
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
            <TableHead>Actions</TableHead>
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
              <TableRow key={primitive.name}>
                <TableCell>
                  <TypeTag type={primitive.type} />
                </TableCell>
                <TableCell className="truncate font-mono text-data text-fg">
                  {primitive.name}
                </TableCell>
                <TableCell className="truncate text-desc text-muted">
                  {primitive.description}
                </TableCell>
                <TableCell>
                  <DeploySkillAction
                    skillName={primitive.name}
                    repos={repos}
                    registryReady={registryReady}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </>
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
