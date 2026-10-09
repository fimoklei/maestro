import { type ReactNode, useRef } from "react";
import { DetailPane, type PaneNotice } from "../ui/detail-pane";
import type { FootItem } from "../ui/foot-actions";
import { NOT_READ_YET } from "../ui/freshness";
import { GitHubFactLink } from "../ui/github-fact-link";
import { GitHubMarkLink } from "../ui/github-mark-link";
import {
  GLOBAL,
  localEditsLine,
  ORIGIN_NOT_READ,
  otherOriginLine,
  REPO_NOT_READ_LINE,
  TARGET_LABEL,
} from "./deploy-state-copy";
import type { DeployStateNotice } from "./notice-copy";
import {
  behindLine,
  changedFact,
  extraFilesFact,
  latestReleaseFact,
  pinnedTagsLine,
  RELEASE_NOT_ADOPTED,
  RETRY_LABELS,
  unfinishedOperationNotice,
} from "./release-head-copy";
import { SelectedSkills } from "./selected-skills";
import { skippedEntryText } from "./skipped-entry-text";
import {
  showsReadFailure,
  type TargetPaneActions,
} from "./target-pane-actions";
import { editedSkills, type TargetRow } from "./target-rows";
import { updateLabel } from "./update-target-copy";

// A target's full reading. Presentational: the foot's items arrive as `foot`,
// Update target as `update`, and the dialogs they open as `dialogs`.
export function TargetDetailPane({
  row,
  position,
  onPage,
  onClose,
  getTriggerElement,
  initialFocus,
  onRetry,
  isRetrying,
  retryFailure,
  compared,
  update,
  foot,
  dialogs,
}: {
  row: TargetRow;
  position?: { index: number; count: number } | null;
  onPage?: (step: -1 | 1) => void;
  onClose: () => void;
  getTriggerElement: (key: string) => HTMLElement | null;
  initialFocus?: string | null;
  onRetry: () => void;
  isRetrying: boolean;
  /** The last retry's failure, stated in place of the unfinished operation. */
  retryFailure: DeployStateNotice | null;
  /** Band 2's freshness line, so the Compared fact dates the same, oldest reading. */
  compared: string | null;
  update: TargetPaneActions["update"];
  foot: FootItem[];
  /** Mounted beside the pane, so a dialog outlives a re-render of its foot. */
  dialogs: ReactNode;
}) {
  const skillsHeading = useRef<HTMLHeadingElement>(null);
  // A failed read's stale record is not stated as current.
  const readFailure = showsReadFailure(row);
  const notice: PaneNotice | null =
    row.pending && !readFailure
      ? {
          content: {
            ...(retryFailure
              ? { ...retryFailure, level: "error" as const }
              : unfinishedOperationNotice(row.pending, row.primitives)),
            action: {
              label: RETRY_LABELS[row.pending.kind],
              onClick: onRetry,
              busy: isRetrying ? row.pending.kind : undefined,
            },
          },
          trigger: retryFailure ? "user-action" : "load",
          retry: true,
        }
      : null;
  const head = row.head;
  const changed = head ? changedFact(head) : null;
  const latestRelease = latestReleaseFact(head);
  const edited = editedSkills(row.primitives);
  const why = [
    // Its sentence names Import local edits, which an operation withholds.
    ...(edited.length === 0 || row.pending
      ? []
      : [localEditsLine(edited, row.behind)]),
    // A plain behind target still says why, and which control moves it.
    ...(head && row.behind && edited.length === 0 && !row.pending && !row.pinned
      ? [behindLine(head, updateLabel(row))]
      : []),
    ...(row.pinned ? [pinnedTagsLine(row.pinned), RELEASE_NOT_ADOPTED] : []),
    ...(row.primitives.length === 0 && row.otherOrigins.length > 0
      ? [otherOriginLine(row.otherOrigins)]
      : []),
    ...(row.github?.kind === "unknown" ? [ORIGIN_NOT_READ] : []),
    ...(readFailure ? [REPO_NOT_READ_LINE] : []),
  ];

  return (
    <>
      <DetailPane
        title={row.name}
        activeKey={row.id}
        position={position}
        onPage={onPage}
        onClose={onClose}
        getTriggerElement={getTriggerElement}
        initialFocus={initialFocus}
        facts={[
          {
            label: TARGET_LABEL,
            value: row.group === GLOBAL ? "Global" : "Repository",
          },
          row.path
            ? {
                label: "Path",
                value: row.path,
                machine: true,
                fullValue: row.path,
                link:
                  row.github?.kind === "link" ? (
                    <GitHubMarkLink
                      page={row.github}
                      name={row.name}
                      focusable
                    />
                  ) : undefined,
              }
            : null,
          head
            ? {
                label: "Release",
                value: (
                  <GitHubFactLink
                    page={row.releaseGitHub}
                    value={head.release}
                  />
                ),
                machine: true,
              }
            : null,
          latestRelease === null
            ? null
            : {
                label: "Latest release",
                value: (
                  <GitHubFactLink
                    page={row.latestReleaseGitHub}
                    value={latestRelease}
                  />
                ),
                machine: true,
                action: update ?? undefined,
              },
          changed === null
            ? null
            : { label: "Changed", value: changed, fullValue: changed },
          head
            ? {
                label: "Compared",
                value:
                  head.comparedAt === null || compared === null
                    ? NOT_READ_YET
                    : compared,
              }
            : null,
          row.extraFiles
            ? { label: "Extra files", value: extraFilesFact(row.extraFiles) }
            : null,
        ]}
        paragraph={[...why, ...row.skipped.map(skippedEntryText)]}
        notices={notice ? [notice] : []}
        subList={
          row.readFailed && row.primitives.length === 0 ? undefined : (
            <SelectedSkills
              row={row}
              headingRef={skillsHeading}
              onRemoved={() => skillsHeading.current?.focus()}
            />
          )
        }
        foot={foot}
      />
      {dialogs}
    </>
  );
}
