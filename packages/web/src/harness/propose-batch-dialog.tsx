import type { BatchItemOutcome, BatchReport } from "@maestro/core";
import { Spinner } from "../ui/button";
import { Dialog, dialogRun } from "../ui/dialog";
import { GroupedList } from "../ui/grouped-list";
import type { NoticeContent } from "../ui/notice";
import { PullRequestLinkList } from "../ui/pull-request-link";
import { Report } from "../ui/report";
import {
  NOT_PROPOSED,
  PROPOSE_CHANGES,
  PROPOSED,
  proposeBatchHeading,
  proposeBatchTitle,
} from "./propose-batch-copy";
import {
  type BatchItem,
  type RunningState,
  reportGroups,
  runningGroups,
} from "./propose-batch-view";

// The type and the outcome, in spacing steps: 88px and 72px, as the release
// dialog and the Harness pull-request column set them.
const RUNNING_SLOTS = [22, 18];

// What one item's row shows while the batch runs.
function OutcomeCell({ standing }: { standing: RunningState }) {
  switch (standing.state) {
    case "waiting":
      return null;
    case "in-progress":
      return <Spinner />;
    case "failed":
      return NOT_PROPOSED;
    case "proposed":
      return standing.pullRequest === null ? (
        PROPOSED
      ) : (
        <PullRequestLinkList
          requests={[standing.pullRequest]}
          focusable={true}
        />
      );
  }
}

// Opens running: a batch without a deletion asks nothing first. The Report
// lands in the same dialog, which cannot close while the batch runs.
export function ProposeBatchDialog({
  items,
  outcomes,
  running,
  report,
  failure,
  onClose,
}: {
  items: readonly BatchItem[];
  /** Each item's outcome as it finished; the rows fill in from these. */
  outcomes: readonly BatchItemOutcome[];
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
            groups={runningGroups(items, outcomes).map((group) => ({
              ...group,
              rows: group.rows.map(({ standing, type, ...row }) => ({
                ...row,
                slots: [
                  type,
                  <OutcomeCell key={row.key} standing={standing} />,
                ],
              })),
            }))}
            checklist={null}
            slots={RUNNING_SLOTS}
            live={null}
          />
        ) : null
      ) : (
        <Report
          heading={proposeBatchHeading(report.proposed.length, items.length)}
          groups={reportGroups(report, items)}
        />
      )}
    </Dialog>
  );
}
