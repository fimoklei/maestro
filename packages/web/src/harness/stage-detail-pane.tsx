import { TYPE_WORD } from "../inventory/type-filter";
import { DetailPane } from "../ui/detail-pane";
import type { NoticeContent } from "../ui/notice";
import { StatusBadge } from "../ui/status-badge";
import type { HarnessTableRow } from "./harness-columns";
import { CONCURRENT_CHANGE_NOTICE } from "./notice-copy";
import { PullRequestCell } from "./pull-request-cell";
import {
  alsoInWords,
  crossStageLine,
  deployedCopiesLine,
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
  const alsoIn = alsoInWords(row);
  return (
    <DetailPane
      title={row.skill}
      activeKey={row.id}
      position={position}
      onPage={onPage}
      onClose={onClose}
      getTriggerElement={getTriggerElement}
      facts={[
        { label: "Type", value: TYPE_WORD.skill },
        { label: "Stage", value: STAGE_NAMES[row.stage] },
        { label: "Status", value: <StatusBadge reading={row.reading} /> },
        { label: "Pull request", value: <PullRequestCell row={row} /> },
        alsoIn === "" ? null : { label: "Also in", value: alsoIn },
      ]}
      paragraph={[
        detailSentence(row, context),
        ...[
          reviewerLine(row),
          crossStageLine(row),
          deployedCopiesLine(row),
        ].filter((line) => line !== null),
      ]}
      notices={[
        // Stated where the press was made: a refusal changed nothing, and the
        // press is still here (#577).
        ...(failure === null
          ? []
          : [{ content: failure, trigger: "user-action" as const }]),
        // Painted with the row, not in answer to a press, so it stays polite.
        ...(row.concurrentChange
          ? [{ content: CONCURRENT_CHANGE_NOTICE, trigger: "load" as const }]
          : []),
      ]}
      foot={row.items}
      leadsWithNextStep
    />
  );
}
