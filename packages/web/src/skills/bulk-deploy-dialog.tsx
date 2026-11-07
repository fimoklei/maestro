import { useId } from "react";
import { WRITTEN_TO } from "../deploy-state/written-to-copy";
import { ACTIONS } from "../ui/busy-copy";
import { DEPLOY_SKILL } from "../ui/control-labels";
import { Dialog, dialogRun } from "../ui/dialog";
import { type FoldLine, FoldList } from "../ui/fold-list";
import { GroupedList, type GroupedListGroup } from "../ui/grouped-list";
import { Notice, type NoticeContent } from "../ui/notice";
import { Report, type ReportGroup } from "../ui/report";
import { Select, type SelectOption } from "../ui/select";
import {
  BULK_DEPLOY_TARGET,
  bulkDeployTitle,
  CHOOSE_A_TARGET,
  DEPLOY_SKILLS,
} from "./skills-copy";

// The bulk deploy the selection bar opens: pick a target, run, read the Report.
// Presentational — the action owns the reads, the plan and the request.

export function BulkDeployDialog({
  count,
  targets,
  selected,
  skills,
  writesTo,
  onSelect,
  unavailable,
  fieldsChanged,
  busy,
  failure,
  report,
  reportFailure,
  onDeploy,
  onClose,
}: {
  count: number;
  targets: SelectOption[];
  /** `null` until the reader chooses; the dialog never chooses for them. */
  selected: string | null;
  /** The staged skills, grouped by what the deploy will do with them. */
  skills: readonly GroupedListGroup[];
  /** The folders a Global deploy writes; null for a repository or before a choice. */
  writesTo: GroupedListGroup | null;
  onSelect: (value: string) => void;
  /** The sentence that says why no deploy can run; `null` when it can. */
  unavailable: string | null;
  /** A target was picked, so a click outside must not drop the choice. */
  fieldsChanged: boolean;
  busy: boolean;
  /** The request itself failed; the run is not proved either way. */
  failure: NoticeContent | null;
  /**
   * The run's result. Once set, the dialog only reads and closes, or runs a
   * row's Deploy again.
   */
  report: {
    heading: string;
    /** The Global folders the run wrote; null for a repository. */
    writtenTo: readonly FoldLine[] | null;
    /** Why the run wrote nothing, above the folders; null when it ran. */
    notice: NoticeContent | null;
    groups: ReportGroup[];
    /**
     * The footer's one write: Retry deploy where the run left its operation
     * unfinished, Deploy again where local edits held it.
     */
    action: { label: string; onRun: () => void } | null;
  } | null;
  /** A reinstall from the Report that was refused: it changed nothing. */
  reportFailure: NoticeContent | null;
  onDeploy: () => void;
  onClose: () => void;
}) {
  const labelId = useId();
  const run = dialogRun({
    source:
      report === null
        ? {
            label: count === 1 ? DEPLOY_SKILL : DEPLOY_SKILLS,
            verb: "deploy",
            tone: "primary",
            unavailable,
            onRun: onDeploy,
          }
        : report.action !== null
          ? {
              label: report.action.label,
              verb: "deploy",
              tone: "primary",
              unavailable: null,
              onRun: report.action.onRun,
            }
          : { bodyBusyLabel: ACTIONS.deploy.busy },
    running: busy,
    outcome: report !== null,
  });

  return (
    <Dialog
      title={bulkDeployTitle(count)}
      version={null}
      width={640}
      {...run}
      // A failed request never reads as zeroed counts: those would claim a
      // clean run nobody saw (#292).
      failure={report === null ? failure : reportFailure}
      describedBy={null}
      fieldsChanged={fieldsChanged}
      onClose={onClose}
    >
      {report === null ? (
        <div className="flex flex-col gap-cell">
          <div className="flex flex-col gap-tight">
            <span id={labelId} className="font-medium text-row">
              {BULK_DEPLOY_TARGET}
            </span>
            <Select
              labelledBy={labelId}
              value={selected}
              placeholder={CHOOSE_A_TARGET}
              options={targets}
              disabled={busy}
              onValueChange={onSelect}
            />
          </div>
          <GroupedList groups={skills} checklist={null} live={null} />
          {writesTo === null ? null : (
            <GroupedList groups={[writesTo]} checklist={null} live={null} />
          )}
        </div>
      ) : (
        <Report
          heading={report.heading}
          lead={
            <>
              {report.notice === null ? null : (
                <Notice trigger="user-action" notice={report.notice} />
              )}
              {report.writtenTo === null ? null : (
                <FoldList legend={WRITTEN_TO} lines={report.writtenTo} />
              )}
            </>
          }
          groups={report.groups}
        />
      )}
    </Dialog>
  );
}
