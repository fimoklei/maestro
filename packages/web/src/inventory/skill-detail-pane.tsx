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

// The "do" surface to the table's "see" (ADR-0016). Presentational: rows
// arrive already folded (skill-deployments.ts), deployAction is injected so
// the pane carries no hooks (frontend.md).
export function SkillDetailPane({
  ref,
  primitive,
  deployments,
  unconfirmed,
  deployAction,
  removeAction,
  onClose,
  getTriggerElement,
}: {
  // Lets the list scroll the pane into view when it opens on a narrow window.
  ref?: React.Ref<HTMLElement>;
  primitive: Primitive;
  deployments: SkillDeployment[];
  // True while any target's read is still pending — an empty list is then
  // "not known yet", not a confirmed absence (J04).
  unconfirmed: boolean;
  deployAction: ReactNode;
  // Null below two deployed targets: one target's own remove already exists,
  // and zero has nothing to remove (#422).
  removeAction: ReactNode;
  onClose: () => void;
  // A lookup, not a resolved element: the row behind an open pane can unmount
  // and remount as a new DOM node, so it must be found fresh at close time
  // (use-skill-detail-pane-focus.ts).
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
      // Beside the table (wide) it holds full height, so the deploy control is
      // always reachable (PRODUCT.md principle 4). Below it (narrow) it's the
      // last thing on the page, full width, no height bound.
      className="flex w-full flex-none flex-col overflow-clip border-line border-t bg-inset min-[1200px]:w-80 min-[1200px]:border-t-0 min-[1200px]:border-l"
    >
      <div className="flex flex-none items-center border-line-faint border-b px-card-x py-row-y">
        <span className="text-dim text-tag uppercase tracking-tag">Skill</span>
        <button
          type="button"
          aria-label="Close detail pane"
          onClick={onClose}
          // Pane is the inset surface, so a fill step would be invisible —
          // this control takes DESIGN.md §5's border half instead.
          className={cn(
            "ml-auto grid size-6 cursor-pointer place-items-center rounded-control border border-line-chip text-dim hover:border-line-dashed hover:text-fg-2",
            HOVER_TRANSITION,
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber",
          )}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      {/* One flow below the label row, so the deploy control sits directly
          under the reach it changes (#470). */}
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
          {/* Trigger-phrase descriptions run for paragraphs and would push the
              deploy control off the pane. Three lines identify the skill; the
              rest opens on ask. */}
          <details className="group mt-2 max-w-[70ch]">
            <summary
              className={cn(
                "cursor-pointer list-none text-desc text-muted [&::-webkit-details-marker]:hidden",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber",
              )}
            >
              <span className="line-clamp-3 group-open:line-clamp-none">
                {primitive.description}
              </span>
              <span
                className={cn(
                  "mt-1 inline-block text-dim text-tag hover:text-fg-2",
                  HOVER_TRANSITION,
                )}
              >
                <span className="group-open:hidden">more ›</span>
                <span className="hidden group-open:inline">less ‹</span>
              </span>
            </summary>
          </details>
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
              {/* Partial set — never lets it read as the full reach (J04). */}
              {unconfirmed ? (
                <p className="mt-2 text-desc text-dim">Loading more targets…</p>
              ) : null}
            </>
          ) : unconfirmed ? (
            <p className="text-desc text-dim">Loading the deploy-state…</p>
          ) : (
            <p className="text-desc text-dim">
              Not deployed to any target. Choose a target under Deploy below.
            </p>
          )}
        </div>

        {/* Sticky, so both directions follow the reach while it fits and only
            pin themselves once a long list scrolls past them. Opaque, since
            that list passes underneath. */}
        <div className="sticky bottom-0 bg-inset">
          <ActionSection label="Deploy">{deployAction}</ActionSection>
          {removeAction === null ? null : (
            <ActionSection label="Remove">{removeAction}</ActionSection>
          )}
        </div>
      </div>
    </aside>
  );
}

function ActionSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border-line-row border-t px-card-x py-row-y">
      <div className="mb-2 text-dim text-tag uppercase tracking-tag">
        {label}
      </div>
      {children}
    </div>
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
      {/* In-sync has no chip, so it holds an sr-only word here instead. */}
      <span aria-hidden="true" className={versionColor[status]}>
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
