import type { Ref } from "react";
import type { ActionsMenuItem } from "../ui/actions-menu";
import { DetailPane } from "../ui/detail-pane";
import type { FootItem } from "../ui/foot-actions";
import { SubListHeading } from "../ui/sub-list-heading";
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
      facts={[
        { label: "Type", value: TYPE_WORD[primitive.type] },
        targetCount === null ? null : { label: "Targets", value: targetCount },
      ]}
      // Trigger-phrase descriptions run for paragraphs. Three lines identify
      // the skill; the rest opens on ask.
      paragraph={[primitive.description]}
      clampParagraph
      foot={footItems}
      leadsWithNextStep
      subList={
        <section>
          <SubListHeading
            label="Deployed to"
            count={unconfirmed ? null : deployments.length}
            headingRef={listHeadingRef}
          />
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
              Loading the Deploy-state…
            </p>
          ) : (
            <p className="m-0 text-gray-11 text-meta">
              {NOT_DEPLOYED_ANYWHERE}
            </p>
          )}
        </section>
      }
    />
  );
}
