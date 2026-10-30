import type { InventorySkill } from "@maestro/core";
import type { ReactNode, Ref } from "react";
import { CATEGORY_FACT } from "../categories/categories-copy";
import type { DeployedRollup } from "../inventory/deployed-rollup";
import {
  pendingReleaseFacts,
  pendingReleaseLine,
} from "../inventory/pending-release-copy";
import type { SkillDeployment } from "../inventory/skill-deployments";
import { skillState, skillStatus } from "../inventory/skill-status";
import { TYPE_WORD } from "../inventory/type-filter";
import { wholeTargetName } from "../shell/target-name";
import type { ActionsMenuItem } from "../ui/actions-menu";
import { LATEST_RELEASE_FACT, NOT_RELEASED_YET } from "../ui/band-copy";
import { NO_CATEGORY } from "../ui/category-menu-copy";
import { cn } from "../ui/cn";
import { DetailPane } from "../ui/detail-pane";
import type { FootItem } from "../ui/foot-actions";
import { rowActionsLabel } from "../ui/row-menu-copy";
import { StatusBadge } from "../ui/status-badge";
import { SubListHeading } from "../ui/sub-list-heading";
import { SubListRow, SubListSkeleton } from "../ui/sub-list-row";
import {
  BEHIND_FACT,
  NOT_DEPLOYED_ANYWHERE,
  ofTotal,
  SOME_TARGETS_NOT_READ,
  STATUS_FACT,
  skillStateLine,
} from "./skills-copy";

// The "do" surface to the table's "see": facts, description, the targets, and
// the row's ⋮ at the foot. Presentational: rows arrive folded, actions as items.
export function SkillDetailPane({
  primitive,
  rollup,
  latestRelease,
  deployments,
  targetItems,
  footItems,
  footMenu,
  category,
  selectionActive,
  listHeadingRef,
  position,
  onPage,
  initialFocus,
  onClose,
  getTriggerElement,
}: {
  primitive: InventorySkill;
  /** The row's roll-up, which the Status and Targets columns read. */
  rollup: DeployedRollup;
  /** The Harness's latest release: null where none exists, undefined until read. */
  latestRelease: string | null | undefined;
  deployments: SkillDeployment[];
  /** One target row's ⋮ items. */
  targetItems: (deployment: SkillDeployment) => readonly ActionsMenuItem[];
  /** The row's ⋮ items, as the foot's buttons. */
  footItems: readonly FootItem[];
  /** A menu a foot item opened, such as Set category's. */
  footMenu: ReactNode;
  /** The skill's category, null for none; undefined while the categories are unread. */
  category: string | null | undefined;
  /** A bulk selection is active: its bar holds the screen's one primary. */
  selectionActive: boolean;
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
  const release = primitive.pendingRelease;
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
        ...(release === null ? [] : pendingReleaseFacts(release)),
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
        category === undefined
          ? null
          : { label: CATEGORY_FACT, value: category ?? NO_CATEGORY },
      ]}
      // The next steps come first, the release before the deploy: trigger-phrase
      // descriptions run for paragraphs, and three lines show before the rest
      // opens on ask.
      paragraph={[
        ...(release === null ? [] : [pendingReleaseLine(primitive, release)]),
        ...(state === null ? [] : [skillStateLine(state)]),
        primitive.description,
      ]}
      clampParagraph
      foot={footItems}
      footMenu={footMenu}
      leadsWithNextStep={!selectionActive}
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
                    wholeTargetName(deployment.target, deployment.label),
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
