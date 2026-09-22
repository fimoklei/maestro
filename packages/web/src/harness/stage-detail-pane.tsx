import { ArrowUpRight } from "lucide-react";
import type { ActionsMenuProps } from "../ui/actions-menu";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { DetailPane } from "../ui/detail-pane";
import { Notice, type NoticeContent } from "../ui/notice";
import { StatusBadge } from "../ui/status-badge";
import type { HarnessTableRow } from "./harness-columns";
import { CONCURRENT_CHANGE_NOTICE } from "./notice-copy";
import { PullRequestCell } from "./pull-request-cell";
import {
  alsoInWords,
  crossStageLine,
  detailSentence,
  reviewerLine,
  STAGE_NAMES,
  type StageContext,
} from "./stage-copy";

// One Harness row in full (#994): its facts, the sentence that says why it is
// here, a refused press, and at the foot the same presses as its ⋮ menu.
export function StageDetailPane({
  row,
  context,
  failure,
  position,
  onPage,
  onClose,
  getTriggerElement,
}: {
  row: HarnessTableRow;
  context: StageContext;
  /** A press made from this row that was refused: it changed nothing. */
  failure: NoticeContent | null;
  position?: { index: number; count: number } | null;
  onPage?: (step: -1 | 1) => void;
  onClose: () => void;
  getTriggerElement: (key: string) => HTMLElement | null;
}) {
  const reviewers = reviewerLine(row);
  const crossStage = crossStageLine(row);
  const alsoIn = alsoInWords(row);
  return (
    <DetailPane
      title={row.skill}
      activeKey={row.id}
      position={position}
      onPage={onPage}
      onClose={onClose}
      getTriggerElement={getTriggerElement}
      actions={
        row.items.length === 0 ? undefined : <FootActions items={row.items} />
      }
    >
      <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-panel gap-y-inline text-row">
        <dt className="text-gray-11">Stage</dt>
        <dd className="m-0 text-gray-12">{STAGE_NAMES[row.stage]}</dd>
        <dt className="text-gray-11">Status</dt>
        <dd className="m-0 flex">
          <StatusBadge reading={row.reading} />
        </dd>
        <dt className="text-gray-11">Pull request</dt>
        <dd className="m-0">
          <PullRequestCell row={row} />
        </dd>
        {alsoIn === "" ? null : (
          <>
            <dt className="text-gray-11">Also in</dt>
            <dd className="m-0 text-gray-12">{alsoIn}</dd>
          </>
        )}
      </dl>
      <div className="mt-section flex flex-col gap-tight text-prose">
        <p className="m-0 text-gray-12">{detailSentence(row, context)}</p>
        {reviewers === null ? null : (
          <p className="m-0 text-gray-11">{reviewers}</p>
        )}
        {crossStage === null ? null : (
          <p className="m-0 text-gray-11">{crossStage}</p>
        )}
      </div>
      {/* Stated where the press was made: a refusal changed nothing, and the
          press is still here (#577). */}
      {failure === null ? null : (
        <div className="mt-cell">
          <Notice trigger="user-action" notice={failure} />
        </div>
      )}
      {row.concurrentChange ? (
        // Painted with the row, not in answer to a press, so it stays polite.
        <div className="mt-cell">
          <Notice trigger="load" notice={CONCURRENT_CHANGE_NOTICE} />
        </div>
      ) : null}
    </DetailPane>
  );
}

// The ⋮ menu's items as buttons, in the same order. A press that leads the
// menu is the stage's next step, so it alone is primary (#1045).
function FootActions({ items }: { items: ActionsMenuProps["items"] }) {
  const lead = items[0];
  const first =
    lead !== undefined && lead.href === undefined && !lead.disabled ? 0 : -1;
  return (
    <>
      {items.map((item, index) =>
        item.href === undefined ? (
          <Button
            key={item.label}
            size="md"
            variant={
              item.danger ? "danger" : index === first ? "primary" : "quiet"
            }
            aria-disabled={item.disabled || undefined}
            onClick={item.disabled ? undefined : item.onSelect}
          >
            {item.label}
          </Button>
        ) : (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex h-control items-center gap-tight rounded-control border border-gray-7 px-cell font-ui text-gray-12 text-row no-underline hover:bg-gray-3",
              "focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2",
            )}
          >
            {item.label}
            <ArrowUpRight
              aria-hidden="true"
              strokeWidth={1.5}
              className="size-4"
            />
          </a>
        ),
      )}
    </>
  );
}
