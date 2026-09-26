import type { Ref } from "react";
import type { ActionsMenuItem } from "../ui/actions-menu";
import { DetailPane } from "../ui/detail-pane";
import { FactList, FactRow } from "../ui/fact-list";
import { FootActions, type FootItem } from "../ui/foot-actions";
import { SubListRow } from "../ui/sub-list-row";
import { NOT_DEPLOYED_ANYWHERE, rowActionsLabel } from "./inventory-copy";
import type { SkillDeployment } from "./skill-deployments";
import { targetReading } from "./skill-status";
import { TYPE_WORD } from "./type-filter";
import type { Primitive } from "./use-inventory";

// The "do" surface to the table's "see": facts, description, the targets, and
// the row's ⋮ at the foot. Presentational: rows arrive folded, actions as items.
export function SkillDetailPane({
  primitive,
  targetCount,
  deployments,
  unconfirmed,
  targetItems,
  footItems,
  listHeadingRef,
  position,
  onPage,
  initialFocus,
  onClose,
  getTriggerElement,
}: {
  primitive: Primitive;
  /** The Targets column's number; null until every read has answered. */
  targetCount: number | null;
  deployments: SkillDeployment[];
  // True while any target's read is pending — an empty list is then "not known
  // yet".
  unconfirmed: boolean;
  /** One target row's ⋮ items. */
  targetItems: (deployment: SkillDeployment) => readonly ActionsMenuItem[];
  /** The row's ⋮ items, as the foot's buttons. */
  footItems: readonly FootItem[];
  /** Where the owner sends focus once a removed target row is gone. */
  listHeadingRef?: Ref<HTMLHeadingElement>;
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
      actions={<FootActions items={footItems} />}
    >
      <FactList>
        <FactRow label="Type">{TYPE_WORD[primitive.type]}</FactRow>
        {targetCount === null ? null : (
          <FactRow label="Targets">{targetCount}</FactRow>
        )}
      </FactList>
      {/* Trigger-phrase descriptions run for paragraphs. Three lines identify
          the skill; the rest opens on ask. */}
      <details className="group mt-section">
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

      <section className="mt-section">
        <h3
          ref={listHeadingRef}
          tabIndex={-1}
          className="m-0 mb-inline font-normal text-gray-11 text-meta focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2"
        >
          Deployed to
        </h3>
        {deployments.length > 0 ? (
          <>
            <ul className="m-0 list-none border-divider border-t p-0">
              {deployments.map((deployment) => (
                <SubListRow
                  key={deployment.rowId ?? deployment.label}
                  mark={targetReading(deployment.status)}
                  name={deployment.label}
                  value={deployment.release}
                  menuLabel={rowActionsLabel(deployment.label)}
                  items={targetItems(deployment)}
                />
              ))}
            </ul>
            {unconfirmed ? (
              <p className="mt-inline text-gray-11 text-meta">
                Loading more targets…
              </p>
            ) : null}
          </>
        ) : unconfirmed ? (
          <p className="m-0 text-gray-11 text-meta">
            Loading the deploy-state…
          </p>
        ) : (
          <p className="m-0 text-gray-11 text-meta">{NOT_DEPLOYED_ANYWHERE}</p>
        )}
      </section>
    </DetailPane>
  );
}
