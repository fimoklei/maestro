import type { ReactNode } from "react";
import { DetailPane } from "../ui/detail-pane";
import { Fact } from "../ui/fact";
import { NOT_DEPLOYED_ANYWHERE } from "./inventory-copy";
import { TargetReadingRow } from "./reach-card";
import type { SkillDeployment } from "./skill-deployments";
import { TYPE_WORD } from "./type-filter";
import type { Primitive } from "./use-inventory";

// The "do" surface to the table's "see" (ADR-0016), on the shared DetailPane.
// Presentational: rows arrive already folded (skill-deployments.ts), and the
// actions are injected so the pane carries no hooks (frontend.md).
export function SkillDetailPane({
  primitive,
  deployments,
  unconfirmed,
  deployAction,
  removeAction,
  position,
  onPage,
  initialFocus,
  onClose,
  getTriggerElement,
}: {
  primitive: Primitive;
  deployments: SkillDeployment[];
  // True while any target's read is still pending — an empty list is then
  // "not known yet", not a confirmed absence (J04).
  unconfirmed: boolean;
  deployAction: ReactNode;
  // Null below two deployed targets: one target's own remove already exists,
  // and zero has nothing to remove (#422).
  removeAction: ReactNode;
  position?: { index: number; count: number } | null;
  onPage?: (step: -1 | 1) => void;
  initialFocus?: string | null;
  onClose: () => void;
  getTriggerElement: (name: string) => HTMLElement | null;
}) {
  return (
    <DetailPane
      title={primitive.name}
      activeKey={primitive.name}
      position={position}
      onPage={onPage}
      initialFocus={initialFocus}
      onClose={onClose}
      getTriggerElement={getTriggerElement}
      actions={
        <div className="flex w-full flex-col gap-inline">
          {deployAction}
          {removeAction}
        </div>
      }
    >
      <dl className="m-0">
        <Fact label="Type" value={TYPE_WORD[primitive.type]} machine={false} />
      </dl>
      {/* Trigger-phrase descriptions run for paragraphs. Three lines identify
          the skill; the rest opens on ask. */}
      <details className="group mt-cell">
        <summary className="cursor-pointer list-none text-gray-11 text-prose focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
          <span className="line-clamp-3 group-open:line-clamp-none">
            {primitive.description}
          </span>
          <span className="mt-tight inline-block text-gray-11 text-meta hover:text-gray-12">
            <span className="group-open:hidden">More ›</span>
            <span className="hidden group-open:inline">Less ‹</span>
          </span>
        </summary>
      </details>

      <h3 className="mt-section mb-inline font-normal text-gray-11 text-meta">
        Deployed to
      </h3>
      {deployments.length > 0 ? (
        <>
          <ul className="m-0 list-none p-0 text-row [&>li]:border-gray-6 [&>li]:border-b">
            {deployments.map((deployment) => (
              <TargetReadingRow
                key={deployment.label}
                deployment={deployment}
              />
            ))}
          </ul>
          {/* Partial set — never lets it read as the full reach (J04). */}
          {unconfirmed ? (
            <p className="mt-inline text-gray-11 text-meta">
              Loading more targets…
            </p>
          ) : null}
        </>
      ) : unconfirmed ? (
        <p className="text-gray-11 text-meta">Loading the deploy-state…</p>
      ) : (
        <p className="text-gray-11 text-meta">{NOT_DEPLOYED_ANYWHERE}</p>
      )}
    </DetailPane>
  );
}
