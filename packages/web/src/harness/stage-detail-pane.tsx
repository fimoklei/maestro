import { DetailPane } from "../ui/detail-pane";
import { FactList, FactRow } from "../ui/fact-list";
import { FootActions } from "../ui/foot-actions";
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
      <FactList>
        <FactRow label="Stage">{STAGE_NAMES[row.stage]}</FactRow>
        <FactRow label="Status">
          <StatusBadge reading={row.reading} />
        </FactRow>
        <FactRow label="Pull request">
          <PullRequestCell row={row} />
        </FactRow>
        {alsoIn === "" ? null : <FactRow label="Also in">{alsoIn}</FactRow>}
      </FactList>
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
