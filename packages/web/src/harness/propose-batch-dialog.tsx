import type { BatchReport } from "@maestro/core";
import { Dialog, dialogRun } from "../ui/dialog";
import { GroupedList } from "../ui/grouped-list";
import type { NoticeContent } from "../ui/notice";
import { Report } from "../ui/report";
import {
  PROPOSE_CHANGES,
  proposeBatchHeading,
  proposeBatchTitle,
} from "./propose-batch-copy";
import {
  type BatchItem,
  reportGroups,
  runningGroups,
} from "./propose-batch-view";

// The type, in spacing steps: 88px, as the release dialog sets it.
const TYPE_SLOT = [22];

// Opens running: a batch without a deletion asks nothing first. The Report
// lands in the same dialog, which cannot close while the batch runs.
export function ProposeBatchDialog({
  items,
  running,
  report,
  failure,
  onClose,
}: {
  items: readonly BatchItem[];
  running: boolean;
  report: BatchReport | null;
  /** Why no item ran, or why the report never came. */
  failure: NoticeContent | null;
  onClose: () => void;
}) {
  const run = dialogRun({
    // The footer holds the busy label while it runs, then only Close.
    source: running
      ? {
          label: PROPOSE_CHANGES,
          verb: "propose",
          tone: "primary",
          unavailable: null,
          onRun: () => {},
        }
      : null,
    running,
    outcome: report !== null,
  });

  return (
    <Dialog
      title={proposeBatchTitle(items.length)}
      version={null}
      width={640}
      {...run}
      failure={failure}
      describedBy={null}
      fieldsChanged={false}
      onClose={onClose}
    >
      {report === null ? (
        failure === null ? (
          <GroupedList
            groups={runningGroups(items)}
            checklist={null}
            slots={TYPE_SLOT}
            live={null}
          />
        ) : null
      ) : (
        <Report
          heading={proposeBatchHeading(
            report.proposed.filter(
              (each) => each.pullRequest.state !== "missing",
            ).length,
            report.proposed.length,
            items.length,
          )}
          groups={reportGroups(report, items)}
        />
      )}
    </Dialog>
  );
}
