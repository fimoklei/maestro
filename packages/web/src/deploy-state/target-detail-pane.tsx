import { type ReactNode, useRef } from "react";
import { DetailPane } from "../ui/detail-pane";
import { FactList, FactRow } from "../ui/fact-list";
import { Notice, type NoticeContent } from "../ui/notice";
import {
  GLOBAL,
  otherOriginLine,
  REPO_NOT_READ,
  REREAD_LABEL,
  TARGET_LABEL,
} from "./deploy-state-copy";
import {
  changedFact,
  comparedFact,
  extraFilesFact,
  pinnedTagsLine,
  RELEASE_NOT_ADOPTED,
  RETRY_LABELS,
  releaseSentence,
  unfinishedOperationNotice,
} from "./release-head-copy";
import { SelectedSkills } from "./selected-skills";
import { skippedEntryKey, skippedEntryText } from "./skipped-entry-text";
import type { TargetRow } from "./target-rows";

// A target's full reading (#993, #1065): facts, the paragraph that explains
// its state, its notice, then its Selected skills. Presentational: the foot's
// controls arrive as `actions`.
export function TargetDetailPane({
  row,
  position,
  onPage,
  onClose,
  getTriggerElement,
  initialFocus,
  onRetry,
  isRetrying,
  onReread,
  now,
  actions,
}: {
  row: TargetRow;
  position?: { index: number; count: number } | null;
  onPage?: (step: -1 | 1) => void;
  onClose: () => void;
  getTriggerElement: (key: string) => HTMLElement | null;
  initialFocus?: string | null;
  onRetry: () => void;
  isRetrying: boolean;
  onReread: () => void;
  /** The screen's one clock, so the Compared fact ticks with band 2. */
  now: Date;
  actions: ReactNode;
}) {
  const skillsHeading = useRef<HTMLHeadingElement>(null);
  // The retry sits in its notice, after its cause, and at the foot as the
  // row's menu holds it (#1065).
  const notice: NoticeContent | null =
    row.readFailed && row.group !== GLOBAL
      ? { ...REPO_NOT_READ, action: { label: REREAD_LABEL, onClick: onReread } }
      : row.pending
        ? {
            ...unfinishedOperationNotice(row.pending, row.primitives),
            action: {
              label: RETRY_LABELS[row.pending.kind],
              onClick: onRetry,
              disabled: isRetrying,
            },
          }
        : null;
  const head = row.head;
  const changed = head ? changedFact(head) : null;
  // Sentences that explain a state form one paragraph; a fact is a value.
  const sentence = head ? releaseSentence(head) : null;
  const why = [
    ...(sentence === null ? [] : [sentence]),
    ...(row.pinned
      ? [`${pinnedTagsLine(row.pinned)}.`, RELEASE_NOT_ADOPTED]
      : []),
    ...(row.primitives.length === 0 && row.otherOrigins.length > 0
      ? [otherOriginLine(row.otherOrigins)]
      : []),
  ];

  return (
    <DetailPane
      title={row.name}
      activeKey={row.id}
      position={position}
      onPage={onPage}
      onClose={onClose}
      getTriggerElement={getTriggerElement}
      initialFocus={initialFocus}
      actions={actions}
    >
      <FactList>
        <FactRow label={TARGET_LABEL}>
          {row.group === GLOBAL ? "Global" : "Repository"}
        </FactRow>
        {row.path ? (
          <FactRow label="Path" machine fullValue={row.path}>
            {row.path}
          </FactRow>
        ) : null}
        {head ? (
          <FactRow label="Release" machine>
            {head.release}
          </FactRow>
        ) : null}
        {head?.latestRelease && head.latestRelease !== head.release ? (
          <FactRow label="Latest release" machine>
            {head.latestRelease}
          </FactRow>
        ) : null}
        {changed === null ? null : <FactRow label="Changed">{changed}</FactRow>}
        {head ? (
          <FactRow label="Compared">{comparedFact(head, now)}</FactRow>
        ) : null}
        {row.extraFiles ? (
          <FactRow label="Extra files">
            {extraFilesFact(row.extraFiles)}
          </FactRow>
        ) : null}
      </FactList>
      {why.length > 0 || row.skipped.length > 0 ? (
        <p className="m-0 mt-section text-gray-12 text-prose">
          {why.map((sentence) => (
            <span key={sentence}>{sentence} </span>
          ))}
          {row.skipped.map((entry, index) => (
            <span key={skippedEntryKey(entry, index)}>
              {skippedEntryText(entry)}{" "}
            </span>
          ))}
        </p>
      ) : null}
      {notice ? (
        <div className="mt-cell">
          <Notice trigger="load" notice={notice} />
        </div>
      ) : null}
      {row.readFailed && row.primitives.length === 0 ? null : (
        <SelectedSkills
          primitives={row.primitives}
          drift={row.drift}
          target={row.target}
          targetName={row.name}
          headingRef={skillsHeading}
          onRemoved={() => skillsHeading.current?.focus()}
        />
      )}
    </DetailPane>
  );
}
