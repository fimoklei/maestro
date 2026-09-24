import { type ReactNode, useRef } from "react";
import { DetailPane } from "../ui/detail-pane";
import { Fact } from "../ui/fact";
import { Notice, type NoticeContent } from "../ui/notice";
import {
  GLOBAL,
  otherOriginLine,
  REPO_NOT_READ,
  REREAD_LABEL,
} from "./deploy-state-copy";
import {
  comparedLine,
  extraFilesLine,
  pinnedTagsLine,
  RELEASE_NOT_ADOPTED,
  RETRY_DEPLOY,
  RETRY_REMOVAL,
  releaseSentence,
  unfinishedOperationNotice,
} from "./release-head-copy";
import { SelectedSkills } from "./selected-skills";
import {
  skippedEntryKey,
  skippedEntryText,
  skippedNeedsAttention,
} from "./skipped-entry-text";
import type { TargetRow } from "./target-rows";
import { RETRY_UPDATE } from "./update-target-copy";
import type { PendingOperation } from "./use-deploy-state";

export const RETRY_LABELS: Record<PendingOperation["kind"], string> = {
  deploy: RETRY_DEPLOY,
  remove: RETRY_REMOVAL,
  update: RETRY_UPDATE,
};

// A target's full reading (#993): facts, then its notice, then its Selected
// skills. Presentational: the foot's controls arrive as `actions`.
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
  actions: ReactNode;
}) {
  const skillsHeading = useRef<HTMLHeadingElement>(null);
  const now = new Date();
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
  const sentence = row.head ? releaseSentence(row.head) : null;

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
      <dl className="m-0 flex flex-col gap-cell">
        <Fact
          label="Kind"
          value={row.group === GLOBAL ? "Global" : "Repository"}
          machine={false}
        />
        {row.path ? (
          <Fact label="Path" value={row.path} title={row.path} />
        ) : null}
        {row.head ? <Fact label="Release" value={row.head.release} /> : null}
        {row.head?.latestRelease ? (
          <Fact label="Latest release" value={row.head.latestRelease} />
        ) : null}
      </dl>
      <div className="mt-cell flex flex-col gap-tight text-gray-11 text-meta">
        {sentence ? <p className="m-0">{sentence}</p> : null}
        {row.head ? <p className="m-0">{comparedLine(row.head, now)}</p> : null}
        {row.pinned ? (
          <>
            <p className="m-0">{pinnedTagsLine(row.pinned)}</p>
            <p className="m-0">{RELEASE_NOT_ADOPTED}</p>
          </>
        ) : null}
        {row.primitives.length === 0 && row.otherOrigins.length > 0 ? (
          <p className="m-0">{otherOriginLine(row.otherOrigins)}</p>
        ) : null}
        {row.extraFiles ? (
          <p className="m-0">{extraFilesLine(row.extraFiles)}</p>
        ) : null}
      </div>
      {notice ? (
        <div className="mt-cell">
          <Notice trigger="load" notice={notice} />
        </div>
      ) : null}
      {row.skipped.length > 0 ? (
        <ul className="m-0 mt-cell flex list-none flex-col gap-tight p-0 text-meta">
          {row.skipped.map((entry, index) => (
            <li
              key={skippedEntryKey(entry, index)}
              className={
                skippedNeedsAttention(entry) ? "text-amber-12" : "text-gray-11"
              }
            >
              {skippedEntryText(entry)}
            </li>
          ))}
        </ul>
      ) : null}
      {row.readFailed && row.primitives.length === 0 ? null : (
        <SelectedSkills
          primitives={row.primitives}
          drift={row.drift}
          target={row.target}
          headingRef={skillsHeading}
          onRemoved={() => skillsHeading.current?.focus()}
        />
      )}
    </DetailPane>
  );
}
