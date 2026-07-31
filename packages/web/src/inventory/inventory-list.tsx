import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { RegisterRepoHint } from "../registry/register-repo-hint";
import type { RegisteredRepo } from "../registry/use-registry";
import { cn } from "../ui/cn";
import { HOVER_TRANSITION } from "../ui/hover-transition";
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
import { BulkRemoveSkillAction } from "./bulk-remove-skill-action";
import { bulkRemoveTargets } from "./bulk-remove-targets";
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

// Deploy-aware table of central skills, with type filter (#288), name search
// (#287), and sortable headers (#287) — all local UI-state over pure models,
// the loaded inventory is never refetched (frontend.md).
export function InventoryList({
  primitives,
  repos,
  registryReady,
  targets = [],
}: {
  primitives: Primitive[];
  repos: RegisteredRepo[];
  registryReady: boolean;
  // Every deploy target, for the per-row reach + drift roll-up (#272). Empty
  // until reads resolve — the roll-up treats that as unconfirmed, not "not deployed".
  targets?: DeploymentTarget[];
}) {
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  // null = loaded order; only reorders once a header is clicked.
  const [sort, setSort] = useState<SortState | null>(null);
  // Held by name (from the full inventory), so a search narrowing the table
  // never closes an already-open pane (ADR-0016).
  const [selected, setSelected] = useState<string | null>(null);
  const toggleSelected = (name: string) =>
    setSelected((current) => (current === name ? null : name));
  // Kept apart from `selected` so inspecting and staging never toggle each
  // other (Model A, #291).
  const [staged, setStaged] = useState<ReadonlySet<string>>(new Set());
  const toggleStagedName = (name: string) =>
    setStaged((current) => toggleStaged(current, name));
  // A ref map, not one ref: the pane instance persists across a row switch,
  // so the trigger is looked up fresh per selection (skill-detail-pane.tsx).
  const rowButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const getTriggerElement = useCallback(
    (name: string) => rowButtonRefs.current.get(name) ?? null,
    [],
  );
  // On a narrow window the pane sits below the table — bring it into view.
  const paneRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected === null) return;
    paneRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  if (primitives.length === 0) {
    return (
      <p className="px-card-x py-row-y text-dim text-tag">
        No skills found in the inventory.
      </p>
    );
  }

  // Segments derive from the full inventory, so a segment never vanishes
  // because it's the one selected.
  const segments = deriveTypeSegments(primitives);
  const narrowed = filterByName(filterByType(primitives, filter), query);
  const visible = sort ? sortPrimitives(narrowed, sort) : narrowed;
  const hiddenCount = hiddenStagedCount(
    staged,
    visible.map((primitive) => primitive.name),
  );

  // Read from the full inventory so a narrowing search never orphans the selection.
  const selectedPrimitive =
    selected === null
      ? null
      : (primitives.find((primitive) => primitive.name === selected) ?? null);
  const selectedRollup = selectedPrimitive
    ? rollUpDeployment(selectedPrimitive.name, targets)
    : null;
  // Two or more, or the bulk would duplicate a remove that already exists on
  // the one target (#422).
  const removable = selectedPrimitive
    ? bulkRemoveTargets(selectedPrimitive.name, targets)
    : [];

  const table = (
    <>
      {/* Gated on registryReady: an unread registry looks identical to an
          empty one (#37). */}
      {registryReady && repos.length === 0 ? (
        <RegisterRepoHint className="block px-card-x pt-row-y" />
      ) : null}
      <div className="flex flex-wrap items-center gap-3 px-card-x py-row-y">
        <div className="relative w-full max-w-[240px]">
          <label htmlFor="inventory-search" className="sr-only">
            Search skills
          </label>
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
            className="w-full rounded-control border border-line bg-inset py-row-y pr-card-x pl-7 font-mono text-fg text-mono-sm placeholder:text-dim focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
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
      {/* Real scrollbar below the table's floor, never a silent clip. Named
          and focusable (WCAG 2.1.1). */}
      <section
        aria-label="Central inventory table"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll container that cannot take focus is keyboard-unreachable (WCAG 2.1.1), and Safari does not focus scrollers on its own
        tabIndex={0}
        // Rows scroll here, not the page — this is what the sticky headers
        // anchor to and what leaves the detail pane standing still.
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
      >
        {/* table-fixed + explicit widths: without it, one long description
            stretches the table past the card that clips it. */}
        <Table className="table-fixed min-w-[560px]">
          {/* Opaque, or the rows would read straight through the sticky header. */}
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">Stage for bulk</span>
              </TableHead>
              <SortableHead
                className="w-20"
                column="type"
                sort={sort}
                onSort={setSort}
              >
                Type
              </SortableHead>
              <SortableHead
                className="w-45"
                column="name"
                sort={sort}
                onSort={setSort}
              >
                Name
              </SortableHead>
              {/* No width: absorbs whatever the fixed columns leave. */}
              <SortableHead column="description" sort={sort} onSort={setSort}>
                Description
              </SortableHead>
              {/* Not a primitive field, so not a sort key (out of #289 scope). */}
              <TableHead className="w-40">Deployed</TableHead>
              <TableHead className="w-8">
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
                  className={
                    primitive.name === selected ? "bg-active" : "hover:bg-inset"
                  }
                >
                  <TableCell>
                    {/* Label pads the 16px box past the 24px floor (WCAG 2.2 AA
                        2.5.8) and stops the click from bubbling to the row select. */}
                    {/* biome-ignore lint/a11y/useKeyWithClickEvents: the label triggers no action of its own — it only stops a bubble, and the keyboard reaches the checkbox directly */}
                    <label
                      className="-m-1.5 inline-flex p-1.5"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={staged.has(primitive.name)}
                        onChange={() => toggleStagedName(primitive.name)}
                        aria-label={`Stage ${primitive.name} for bulk`}
                        className="size-4 accent-amber focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                      />
                    </label>
                  </TableCell>
                  <TableCell>
                    <TypeTag type={primitive.type} />
                  </TableCell>
                  <TableCell className="font-mono text-data text-fg">
                    {/* A real button for keyboard focus (#290); stops
                        propagation so a click resolves to one toggle, not two. */}
                    <button
                      ref={(el) => {
                        if (el) rowButtonRefs.current.set(primitive.name, el);
                        else rowButtonRefs.current.delete(primitive.name);
                      }}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleSelected(primitive.name);
                      }}
                      aria-expanded={primitive.name === selected}
                      aria-controls={`skill-detail-${primitive.name}`}
                      title={primitive.name}
                      // Negative margin offsets the padding: hit area reaches
                      // the 24px floor (WCAG 2.2 AA 2.5.8) without growing the row.
                      className="-my-0.5 block w-full truncate py-0.5 text-left text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
                    >
                      {primitive.name}
                    </button>
                  </TableCell>
                  <TableCell
                    className="truncate text-desc text-muted"
                    title={primitive.description}
                  >
                    {primitive.description}
                  </TableCell>
                  <TableCell>
                    <DeployedCell
                      rollup={rollUpDeployment(primitive.name, targets)}
                    />
                  </TableCell>
                  {/* Decorative — the name button already carries aria-expanded. */}
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
      </section>
    </>
  );

  return (
    // Side by side only ~1200px+: table's 560px floor + 320px pane, plus
    // sidebar and padding. Narrower, the pane drops below the table instead.
    <div className="flex min-h-0 flex-1 flex-col min-[1200px]:flex-row min-[1200px]:items-stretch">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{table}</div>
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
              // Keyed by skill, like the deploy action: an open dialog or a
              // failed run can never carry over to the next skill.
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
  );
}

// The active column carries aria-sort and a visible glyph (#287).
function SortableHead({
  column,
  sort,
  onSort,
  className,
  children,
}: {
  column: SortColumn;
  sort: SortState | null;
  onSort: (next: SortState) => void;
  className?: string;
  children: ReactNode;
}) {
  const active = sort?.column === column ? sort.direction : null;
  const ariaSort =
    active === "asc" ? "ascending" : active === "desc" ? "descending" : "none";

  return (
    <TableHead ariaSort={ariaSort} className={className}>
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, column))}
        className={cn(
          "-my-1.5 flex cursor-pointer items-center gap-1 py-1.5 font-mono text-tag uppercase tracking-tag text-inherit hover:text-fg-2",
          HOVER_TRANSITION,
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber",
        )}
      >
        {children}
        <span aria-hidden="true" className="text-muted">
          {active === "asc" ? "↑" : active === "desc" ? "↓" : ""}
        </span>
      </button>
    </TableHead>
  );
}
