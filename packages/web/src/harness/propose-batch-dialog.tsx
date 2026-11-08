import type { BatchItemOutcome, BatchReport } from "@maestro/core";
import { Dialog, dialogRun } from "../ui/dialog";
import { GroupedList } from "../ui/grouped-list";
import type { NoticeContent } from "../ui/notice";
import { Report } from "../ui/report";
import { BatchDeletionConfirmation } from "./batch-deletion-confirmation";
import { BatchOutcomeCell } from "./batch-outcome-cell";
import {
  NOT_IN_NEXT_RELEASE,
  noGhNotice,
  notInNextReleaseNotice,
  PROPOSE_CHANGES,
  proposeBatchHeading,
  proposeBatchTitle,
} from "./propose-batch-copy";
import {
  type BatchItem,
  reportGroups,
  runningGroups,
} from "./propose-batch-view";

// The type and the outcome, in spacing steps: 88px and 72px, as the release
// dialog and the Harness pull-request column set them.
const RUNNING_SLOTS = [22, 18];

const missingOf = (report: BatchReport) =>
  report.proposed.filter((each) => each.pullRequest.state === "missing").length;

// A batch with a deletion opens on its confirmation first; a batch without one
// opens running. The Report lands in the same dialog, which cannot close while
// the batch runs.
export function ProposeBatchDialog({
  items,
  origin,
  confirming,
  outcomes,
  running,
  report,
  failure,
  onConfirm,
  onClose,
}: {
  items: readonly BatchItem[];
  /** The repository the deletions leave, host dropped: owner/repo. */
  origin: string;
  /** The confirmation waits for the reader's press. */
  confirming: boolean;
  /** Each item's outcome as it finished; the rows fill in from these. */
  outcomes: readonly BatchItemOutcome[];
  running: boolean;
  report: BatchReport | null;
  /** Why no item ran, or why the report never came. */
  failure: NoticeContent | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  // The write needs each deletion's default-branch tree: without one the
  // confirmation is blocked before the press.
  const untreed = items
    .filter(
      (item) => item.change === "deletion" && item.seenRemoteTree === null,
    )
    .map((item) => item.name);
  const blocked = confirming && untreed.length > 0;
  const run = dialogRun({
    // The footer holds the busy label while it runs, then only Close.
    source: confirming
      ? {
          label: proposeBatchTitle(items.length),
          verb: "propose",
          tone: "danger",
          unavailable: blocked ? NOT_IN_NEXT_RELEASE : null,
          onRun: onConfirm,
        }
      : running
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
      // Without gh, one warning above the footer gives every row's next step.
      failure={
        report !== null && report.gh === "absent" && missingOf(report) > 0
          ? { level: "warning", ...noGhNotice(missingOf(report)) }
          : blocked
            ? notInNextReleaseNotice(untreed)
            : failure
      }
      describedBy={null}
      fieldsChanged={false}
      onClose={onClose}
    >
      {confirming ? (
        <BatchDeletionConfirmation items={items} origin={origin} />
      ) : report === null ? (
        failure === null ? (
          <GroupedList
            groups={runningGroups(items, outcomes).map((group) => ({
              ...group,
              rows: group.rows.map(({ standing, type, ...row }) => ({
                ...row,
                slots: [
                  type,
                  <BatchOutcomeCell key={row.key} standing={standing} />,
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
          heading={proposeBatchHeading(
            report.proposed.length - missingOf(report),
            report.proposed.length,
            items.length,
          )}
          groups={reportGroups(report, items)}
        />
      )}
    </Dialog>
  );
}
