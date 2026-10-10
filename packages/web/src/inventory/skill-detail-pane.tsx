import type { Ref } from "react";
import type { ActionsMenuItem } from "../ui/actions-menu";
import { cn } from "../ui/cn";
import { DetailPane } from "../ui/detail-pane";
import type { FootItem } from "../ui/foot-actions";
import { rowActionsLabel } from "../ui/row-menu-copy";
import { StatusBadge } from "../ui/status-badge";
import { SubListHeading } from "../ui/sub-list-heading";
import { SubListRow, SubListSkeleton } from "../ui/sub-list-row";
import type { DeployedRollup } from "./deployed-rollup";
import {
  BEHIND_FACT,
  LATEST_RELEASE_FACT,
  NOT_DEPLOYED_ANYWHERE,
  NOT_RELEASED_YET,
  ofTotal,
  SOME_TARGETS_NOT_READ,
  STATUS_FACT,
  skillStateLine,
} from "./inventory-copy";
import type { SkillDeployment } from "./skill-deployments";
import { skillState, skillStatus } from "./skill-status";
import { TYPE_WORD } from "./type-filter";
import type { Primitive } from "./use-inventory";

// The "do" surface to the table's "see": facts, description, the targets, and
// the row's ⋮ at the foot. Presentational: rows arrive folded, actions as items.
export function SkillDetailPane({
  primitive,
  rollup,
  latestRelease,
  deployments,
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
  /** The row's roll-up, which the Status and Targets columns read. */
  rollup: DeployedRollup;
  /** The Harness's latest release: null where none exists, undefined until read. */
  latestRelease: string | null | undefined;
  deployments: SkillDeployment[];
  /** One target row's ⋮ items. */
  targetItems: (deployment: SkillDeployment) => readonly ActionsMenuItem[];
  /** The row's ⋮ items, as the foot's buttons. */
  footItems: readonly FootItem[];
  /** Where the owner sends focus once a removed target row is gone. */
  listHeadingRef: Ref<HTMLHeadingElement>;
  position?: { index: number; count: number } | null;
  onPage?: (step: -1 | 1) => void;
  initialFocus?: string | null;
  onClose: () => void;
  getTriggerElement: (name: string) => HTMLElement | null;
}) {
  // A pending read makes an empty list "not known yet"; a failed one means the
  // list may miss a target.
  const pending = Boolean(rollup.pending);
  const unreadable = Boolean(rollup.unreadable);
  const status = skillStatus(rollup);
  const state = skillState(rollup, deployments, latestRelease);
  const listed = deployments.length > 0 || pending;
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
        status === null
          ? null
          : { label: STATUS_FACT, value: <StatusBadge reading={status} /> },
        latestRelease === undefined
          ? null
          : {
              label: LATEST_RELEASE_FACT,
              value: latestRelease ?? NOT_RELEASED_YET,
              machine: latestRelease !== null,
            },
        status === null
          ? null
          : { label: "Targets", value: rollup.targetCount },
        status === null || rollup.targetCount === 0
          ? null
          : {
              label: BEHIND_FACT,
              value: ofTotal(rollup.behindCount, rollup.targetCount),
            },
      ]}
      // The state comes first: trigger-phrase descriptions run for
      // paragraphs, and three lines show before the rest opens on ask.
      paragraph={
        state === null
          ? [primitive.description]
          : [skillStateLine(state), primitive.description]
      }
      clampParagraph
      foot={footItems}
      leadsWithNextStep
      subList={
        <section>
          <SubListHeading
            label="Deployed to"
            count={pending ? null : deployments.length}
            headingRef={listHeadingRef}
          />
          {listed ? (
            <ul
              aria-busy={pending || undefined}
              className="m-0 list-none border-divider border-t p-0"
            >
              {deployments.map((deployment) => (
                <SubListRow
                  key={deployment.rowId ?? deployment.label}
                  mark={deployment.mark}
                  name={deployment.label}
                  value={deployment.release}
                  menuLabel={rowActionsLabel(
                    deployment.target.kind === "repo"
                      ? deployment.target.repoPath
                      : deployment.label,
                  )}
                  items={targetItems(deployment)}
                />
              ))}
              {pending ? <SubListSkeleton rows={2} /> : null}
            </ul>
          ) : null}
          {unreadable ? (
            <p
              className={cn(
                "m-0 text-gray-11 text-meta",
                listed && "mt-inline",
              )}
            >
              {SOME_TARGETS_NOT_READ}
            </p>
          ) : listed ? null : (
            <p className="m-0 text-gray-11 text-meta">
              {NOT_DEPLOYED_ANYWHERE}
            </p>
          )}
        </section>
      }
    />
  );
}
