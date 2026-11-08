import type { BatchItemOutcome, BatchReport } from "@maestro/core";
import { Spinner } from "../ui/button";
import { Dialog, dialogRun } from "../ui/dialog";
import { GroupedList } from "../ui/grouped-list";
import type { NoticeContent } from "../ui/notice";
import { PhraseText } from "../ui/phrase-text";
import { PullRequestLinkList } from "../ui/pull-request-link";
import { Report } from "../ui/report";
import {
  deletionsKept,
  deletionsSentence,
  NOT_PROPOSED,
  PER_CHANGE_PULL_REQUEST,
  PROPOSE_CHANGES,
  PROPOSED,
  proposeBatchHeading,
  proposeBatchTitle,
} from "./propose-batch-copy";
import {
  type BatchItem,
  confirmationGroups,
  type RunningState,
  reportGroups,
  runningGroups,
} from "./propose-batch-view";

// The type, in spacing steps: 88px, as the release dialog sets it.
const TYPE_SLOT = [22];

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
  const run = dialogRun({
    // The footer holds the busy label while it runs, then only Close.
    source: confirming
      ? {
          label: proposeBatchTitle(items.length),
          verb: "propose",
          tone: "danger",
          unavailable: null,
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
      failure={failure}
      describedBy={null}
      fieldsChanged={false}
      onClose={onClose}
    >
      {confirming ? (
        <DeletionConfirmation items={items} origin={origin} />
      ) : report === null ? (
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

// What the deletions do, then the changes grouped by their Change word.
function DeletionConfirmation({
  items,
  origin,
}: {
  items: readonly BatchItem[];
  origin: string;
}) {
  const deletions = items.filter((item) => item.change === "deletion");
  const skills = deletions.filter((item) => item.type === "skill").length;
  return (
    <div className="flex flex-col gap-cell">
      <div className="flex flex-col gap-tight text-gray-11">
        <p className="m-0 text-gray-12">
          <PhraseText copy={deletionsSentence(deletions, origin)} />
        </p>
        <p className="m-0">{PER_CHANGE_PULL_REQUEST}</p>
        {deletionsKept(skills, deletions.length - skills).map((sentence) => (
          <p key={sentence} className="m-0">
            {sentence}
          </p>
        ))}
      </div>
      <GroupedList
        groups={confirmationGroups(items)}
        checklist={null}
        slots={TYPE_SLOT}
        live={null}
      />
    </div>
  );
}
