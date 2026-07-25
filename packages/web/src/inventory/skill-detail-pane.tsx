import type { ReactNode } from "react";
import type { DriftStatus } from "../drift/drift-view-model";
import { versionColor } from "../drift/version-color";
import { Chip } from "../ui/chip";
import { cn } from "../ui/cn";
import { HOVER_TRANSITION } from "../ui/hover-transition";
import { TypeTag } from "../ui/type-tag";
import type { SkillDeployment } from "./skill-deployments";
import type { Primitive } from "./use-inventory";
import { useSkillDetailPaneFocus } from "./use-skill-detail-pane-focus";

// The inventory's detail pane: the "do" surface to the table's "see" (ADR-0016).
// Selecting a row opens it; it names the skill, lists where the skill is deployed
// with the version at each target (the per-primitive lens on the same cached
// deploy-state, #290), and hosts the deploy control moved out of the row.
//
// Presentational: the "deployed to" rows arrive already folded (skill-deployments.ts),
// and the live deploy control is injected as `deployAction` so the pane carries no
// hooks and stays storyable (frontend.md).
export function SkillDetailPane({
  ref,
  primitive,
  deployments,
  unconfirmed,
  deployAction,
  onClose,
  getTriggerElement,
}: {
  // Lets the list scroll the pane into view when it opens below the table on a
  // narrow window. Presentation only — the pane still owns no state.
  ref?: React.Ref<HTMLElement>;
  primitive: Primitive;
  deployments: SkillDeployment[];
  // True while any target's deploy-state read is still pending or unreadable, so
  // the reach is not yet known. An empty list is then "not known yet", not a
  // confirmed "deployed nowhere" — the J04 honesty the deployed cell keeps.
  unconfirmed: boolean;
  deployAction: ReactNode;
  onClose: () => void;
  // Looks up the row button that opened a skill's pane, by name — where focus
  // goes back to when it closes. A lookup, not a resolved element, because
  // selection persists across a narrowing search: the row behind an open pane
  // can unmount and remount as a new DOM node while the pane stays open, so
  // the button has to be found fresh at close time, not captured once at open
  // time (use-skill-detail-pane-focus.ts).
  getTriggerElement: (name: string) => HTMLElement | null;
}) {
  const paneId = `skill-detail-${primitive.name}`;
  const { headingRef } = useSkillDetailPaneFocus({
    activeKey: primitive.name,
    getTriggerElement,
    onClose,
  });

  return (
    <aside
      ref={ref}
      id={paneId}
      aria-label={`${primitive.name} detail`}
      // Sticky, not static: the table beside it runs far past one screen, and a
      // static pane scrolled away with it, taking the deploy control off-screen.
      // Steering stays next to the state that demands it (PRODUCT.md principle 4).
      // Beside the table (wide windows) the pane sticks and is bounded by the
      // scrolling region itself: 100cqh is the content height of the shell's
      // main container (app-shell.tsx), which is exactly the room it sticks in,
      // so the whole pane — deploy control included — lands inside the screen at
      // any window height. Stacked below the table (narrow windows) it is the
      // last thing on the page, so it takes the full width and no height bound;
      // sticky then has nothing left to stick to and quietly does nothing.
      className="sticky top-0 flex w-full flex-none flex-col overflow-clip border-line border-t bg-inset min-[1200px]:max-h-[100cqh] min-[1200px]:w-80 min-[1200px]:border-t-0 min-[1200px]:border-l"
    >
      <div className="flex flex-none items-center border-line-faint border-b px-card-x py-row-y">
        <span className="text-dim text-tag uppercase tracking-tag">Skill</span>
        <button
          type="button"
          aria-label="Close detail pane"
          onClick={onClose}
          // The pane itself is the inset surface, so a fill step would be
          // invisible here; this control takes DESIGN.md §5's border half of
          // "background or border moves one step up its ramp".
          className={cn(
            "ml-auto grid size-6 cursor-pointer place-items-center rounded-control border border-line-chip text-dim hover:border-line-dashed hover:text-fg-2",
            HOVER_TRANSITION,
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber",
          )}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {/* Only the reading matter scrolls. The label row above and the deploy
          control below stay put, so a skill with a long description can never
          push the one action in this pane out of reach. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-line-faint border-b px-card-x py-row-y">
          <div className="flex items-center gap-2">
            <TypeTag type={primitive.type} />
            <h2
              ref={headingRef}
              tabIndex={-1}
              className={cn(
                "font-medium text-fg text-lg",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber",
              )}
            >
              {primitive.name}
            </h2>
          </div>
          {/* Capped for reading: stacked below the table the pane runs the full
              card width, where an uncapped line gets far too long to scan. */}
          <p className="mt-2 max-w-[70ch] text-desc text-muted">
            {primitive.description}
          </p>
        </div>

        <div className="border-line-faint border-b px-card-x py-row-y">
          <div className="mb-2 text-dim text-tag uppercase tracking-tag">
            Deployed to
          </div>
          {deployments.length > 0 ? (
            <>
              <ul>
                {deployments.map((deployment) => (
                  <DeployedRow key={deployment.label} deployment={deployment} />
                ))}
              </ul>
              {/* Some targets loaded, others are still pending or unreadable —
                  the listed set is partial, so never let it read as the full
                  reach (J04). */}
              {unconfirmed ? (
                <p className="mt-2 text-desc text-dim">
                  more targets may still be loading…
                </p>
              ) : null}
            </>
          ) : unconfirmed ? (
            // The reach is not yet known — never claim a definite absence while
            // a read is still in flight or failed (J04).
            <p className="text-desc text-dim">still reading deploy state…</p>
          ) : (
            <p className="text-desc text-dim">not deployed to any target yet</p>
          )}
        </div>
      </div>

      <div className="flex-none border-line-row border-t px-card-x py-row-y">
        <div className="mb-2 text-dim text-tag uppercase tracking-tag">
          Deploy
        </div>
        {deployAction}
      </div>
    </aside>
  );
}

const driftChip: Partial<
  Record<DriftStatus, { tone: "drift" | "dim"; label: string }>
> = {
  behind: { tone: "drift", label: "behind" },
  unknown: { tone: "dim", label: "unknown" },
  unverified: { tone: "dim", label: "unverified" },
};

function DeployedRow({ deployment }: { deployment: SkillDeployment }) {
  const { label, version, status, latest } = deployment;
  const chip = driftChip[status];
  return (
    <li className="flex items-center gap-2 py-1 text-tag">
      {/* Status dot pairs colour with a glyph and text so in-sync/drift survive
          without colour perception (PRODUCT.md). Drift states carry the word in
          their chip; in-sync has no chip, so it holds an sr-only word here. */}
      <span
        aria-hidden="true"
        className={cn("text-[9px]", versionColor[status])}
      >
        ●
      </span>
      {status === "up-to-date" ? (
        <span className="sr-only">in sync</span>
      ) : null}
      <span className="flex-1 truncate text-fg-2">{label}</span>
      <span className={cn("font-mono", versionColor[status])}>
        {status === "behind" && latest ? `${version} → ${latest}` : version}
      </span>
      {chip ? <Chip tone={chip.tone}>{chip.label}</Chip> : null}
    </li>
  );
}
