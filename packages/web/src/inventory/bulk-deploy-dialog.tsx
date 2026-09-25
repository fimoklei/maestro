import { useId } from "react";
import { CLOSE } from "../deploy-state/update-target-copy";
import { ACTIONS } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { DIALOG_FOOTER, DialogShell } from "../ui/dialog-shell";
import { Notice, type NoticeContent } from "../ui/notice";
import { Report, type ReportGroup } from "../ui/report";
import {
  BULK_DEPLOY_TARGET,
  bulkDeployTitle,
  DEPLOY_SKILL,
  DEPLOY_SKILLS,
  LOADING_TARGETS,
} from "./inventory-copy";

// The bulk deploy the selection bar opens: pick a target, run, read the Report.
// Presentational — the action owns the reads, the plan and the request.

export type BulkDeployTargetOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export function BulkDeployDialog({
  count,
  targets,
  selected,
  onSelect,
  loadingTargets,
  deployBlocked,
  busy,
  failure,
  report,
  reportFailure = null,
  onDeploy,
  onClose,
}: {
  count: number;
  targets: BulkDeployTargetOption[];
  selected: string;
  onSelect: (value: string) => void;
  /** The registry has not answered, so no target can be offered yet. */
  loadingTargets: boolean;
  /** The chosen target cannot take a deploy yet, or at all. */
  deployBlocked: boolean;
  busy: boolean;
  /** The request itself failed; the run is not proved either way. */
  failure: NoticeContent | null;
  /** The run's result. Once set, the dialog only reads and closes. */
  report: { heading: string; groups: ReportGroup[] } | null;
  /** A reinstall from the Report that was refused: it changed nothing. */
  reportFailure?: NoticeContent | null;
  onDeploy: () => void;
  onClose: () => void;
}) {
  const title = bulkDeployTitle(count);
  const bodyId = useId();
  const selectId = useId();

  return (
    <DialogShell
      label={title}
      describedBy={bodyId}
      width={640}
      onClose={onClose}
      // Its outcome is readable nowhere else while the run goes.
      closeEnabled={!busy}
    >
      <div className="flex shrink-0 items-center border-gray-7 border-b px-panel py-cell">
        <h2 className="font-semibold font-ui text-gray-12 text-heading">
          {title}
        </h2>
      </div>
      <div
        id={bodyId}
        className="flex min-h-0 flex-col gap-panel overflow-y-auto p-panel"
      >
        {report === null ? (
          <>
            {/* A failed request never reads as zeroed counts: those would
                claim a clean run nobody saw (#292). */}
            <Notice trigger="user-action" notice={failure} />
            <div className="flex flex-col gap-tight">
              <label
                htmlFor={selectId}
                className="font-medium font-ui text-gray-12 text-row"
              >
                {BULK_DEPLOY_TARGET}
              </label>
              <select
                id={selectId}
                value={selected}
                disabled={busy}
                onChange={(event) => onSelect(event.target.value)}
                className="h-control w-full max-w-80 truncate rounded-control border border-gray-9 bg-gray-1 px-inline font-mono text-gray-12 text-row"
              >
                {targets.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <Notice trigger="user-action" notice={reportFailure} />
            <Report heading={report.heading} groups={report.groups} />
          </>
        )}
      </div>
      <div className={DIALOG_FOOTER}>
        {report === null ? (
          <>
            <Button variant="quiet" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={loadingTargets || deployBlocked}
              onClick={onDeploy}
            >
              {loadingTargets
                ? LOADING_TARGETS
                : busy
                  ? ACTIONS.deploy.busy
                  : count === 1
                    ? DEPLOY_SKILL
                    : DEPLOY_SKILLS}
            </Button>
          </>
        ) : (
          <Button variant="primary" className="ml-auto" onClick={onClose}>
            {CLOSE}
          </Button>
        )}
      </div>
    </DialogShell>
  );
}
