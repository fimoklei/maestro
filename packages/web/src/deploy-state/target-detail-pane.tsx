import { type ReactNode, useRef } from "react";
import { Button } from "../ui/button";
import { DetailPane } from "../ui/detail-pane";
import { FactList, FactRow } from "../ui/fact-list";
import { GitHubFactLink } from "../ui/github-fact-link";
import { GitHubMarkLink } from "../ui/github-mark-link";
import { Notice, type NoticeContent } from "../ui/notice";
import {
  GLOBAL,
  localEditsLine,
  ORIGIN_NOT_READ,
  otherOriginLine,
  REPO_NOT_READ,
  REREAD_LABEL,
  TARGET_LABEL,
} from "./deploy-state-copy";
import {
  changedFact,
  comparedFact,
  extraFilesFact,
  latestReleaseFact,
  pinnedTagsLine,
  RELEASE_NOT_ADOPTED,
  RETRY_LABELS,
  unfinishedOperationNotice,
} from "./release-head-copy";
import { SelectedSkills } from "./selected-skills";
import { skippedEntryKey, skippedEntryText } from "./skipped-entry-text";
import {
  showsReadFailure,
  type TargetPaneActions,
} from "./target-pane-actions";
import { editedSkills, type TargetRow } from "./target-rows";

// A target's full reading. Presentational: the foot's controls arrive as
// `actions`, Update target as `update`.
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
  update,
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
  update: TargetPaneActions["update"];
  actions: ReactNode;
}) {
  const skillsHeading = useRef<HTMLHeadingElement>(null);
  const notice: NoticeContent | null = showsReadFailure(row)
    ? { ...REPO_NOT_READ, action: { label: REREAD_LABEL, onClick: onReread } }
    : row.pending
      ? {
          ...unfinishedOperationNotice(row.pending, row.primitives),
          action: {
            label: RETRY_LABELS[row.pending.kind],
            onClick: onRetry,
            disabled: isRetrying,
            primary: true,
          },
        }
      : null;
  const head = row.head;
  const changed = head ? changedFact(head) : null;
  const latestRelease = latestReleaseFact(head);
  const edited = editedSkills(row.primitives);
  const why = [
    // Its sentence names Import local edits, which an operation withholds.
    ...(edited.length === 0 || row.pending ? [] : [localEditsLine(edited)]),
    ...(row.pinned
      ? [`${pinnedTagsLine(row.pinned)}.`, RELEASE_NOT_ADOPTED]
      : []),
    ...(row.primitives.length === 0 && row.otherOrigins.length > 0
      ? [otherOriginLine(row.otherOrigins)]
      : []),
    ...(row.github?.kind === "unknown" ? [ORIGIN_NOT_READ] : []),
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
          <FactRow
            label="Path"
            machine
            fullValue={row.path}
            action={
              row.github?.kind === "link" ? (
                <GitHubMarkLink page={row.github} name={row.name} focusable />
              ) : undefined
            }
          >
            {row.path}
          </FactRow>
        ) : null}
        {head ? (
          <FactRow label="Release" machine>
            <GitHubFactLink page={row.releaseGitHub} value={head.release} />
          </FactRow>
        ) : null}
        {latestRelease === null ? null : (
          <FactRow
            label="Latest release"
            machine
            action={
              update === null ? undefined : (
                <Button
                  variant={update.primary ? "primary" : "quiet"}
                  aria-label={update.name}
                  onClick={update.onSelect}
                >
                  {update.label}
                </Button>
              )
            }
          >
            {latestRelease}
          </FactRow>
        )}
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
          row={row}
          headingRef={skillsHeading}
          onRemoved={() => skillsHeading.current?.focus()}
        />
      )}
    </DetailPane>
  );
}
