import { FolderGit2, FolderInput, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRereadInventory } from "../shell/use-reread-inventory";
import { Button } from "../ui/button";
import { DataTable } from "../ui/data-table";
import { DetailPaneSlot } from "../ui/detail-pane";
import { EmptyState } from "../ui/empty-state";
import { IconButton } from "../ui/icon-button";
import { Notice } from "../ui/notice";
import { Panel } from "../ui/panel";
import { StatusBadge } from "../ui/status-badge";
import { reading, readingRank } from "../ui/status-reading";
import { useNarrowerThan } from "../ui/use-narrower-than";
import { useReadSkeleton } from "../ui/use-read-skeleton";
import { cloneSyncNotice } from "./clone-sync-notice";
import { type HarnessTableRow, harnessColumns, rowId } from "./harness-columns";
import { HarnessDialogs } from "./harness-dialogs";
import {
  freshnessLabel,
  harnessAnnouncement,
  journeyConfirmedEmpty,
  releaseEnabled,
  type StageSection,
  stageSections,
} from "./harness-view-model";
import {
  harnessStateNotice,
  refreshNotice,
  releasePublishedNotice,
  skillRestoredNotice,
  stageReadNotice,
  staleStatusNotice,
} from "./notice-copy";
import { rowItems } from "./row-actions";
import { PROPOSAL_EMPTY, statusReading } from "./stage-copy";
import { StageDetailPane } from "./stage-detail-pane";
import type { ReleasePlan, SemverStep } from "./use-harness";
import {
  useDiscardReleasePlan,
  useHarness,
  usePublishRelease,
  useRefreshHarness,
  useReleasePlan,
} from "./use-harness";
import { useHarnessPresses } from "./use-harness-presses";
import { useImportFlow } from "./use-import-flow";

export const REREAD_HARNESS = "Re-read Harness";
const TABLE_LABEL = "Harness table";
// Under 1024px, and beside an open pane, only Name, Status and ⋮ stay; the
// rest is in the pane and the hover card (#994).
const NARROW_HIDDEN = { type: false, "pull-request": false, "also-in": false };

// The Harness (#994): one table with a group per stage, so a skill reads from
// local work to release top to bottom, and a row's full story in its pane.
export function HarnessView() {
  const harness = useHarness();
  const state = harness.data;
  const refresh = useRefreshHarness();
  const { mutate: fetchRemote } = refresh;
  const reading = refresh.isPending || harness.isFetching;
  const skeleton = useReadSkeleton(
    reading || (state === undefined && !harness.isError),
  );
  // The one way back from every failed read, so a failure never closes it.
  const reread = () => {
    skeleton.press();
    fetchRemote();
  };

  // Plan open/closed is UI-state; the plan itself is fetched only while the
  // dialog is open (frontend.md).
  const [planOpen, setPlanOpen] = useState(false);
  const plan = useReleasePlan(planOpen);
  const discardPlan = useDiscardReleasePlan();
  const publish = usePublishRelease();
  const rereadInventory = useRereadInventory();
  const closePlan = () => {
    setPlanOpen(false);
    discardPlan();
    // A failed attempt must not haunt the next time this dialog opens.
    publish.reset();
  };
  const handlePublish = (step: SemverStep, plan: ReleasePlan) => {
    publish.mutate(
      {
        step,
        previousTag: plan.previousTag,
        previousTagCommit: plan.previousTagCommit,
        revision: plan.revision,
      },
      // The dialog closes on success and keeps no result of its own: what was
      // published is stated above the table (#849).
      {
        onSuccess: () => {
          setPlanOpen(false);
          discardPlan();
        },
      },
    );
  };

  const importFlow = useImportFlow();
  const presses = useHarnessPresses(state);

  // The row whose detail pane is open, and the table's order it pages through.
  const [selected, setSelected] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const gridRef = useRef<HTMLTableElement>(null);
  const getTriggerElement = useCallback(() => gridRef.current, []);
  const table = useNarrowerThan(1008);

  // A refused press is stated in its row's pane, which opens to show it; a
  // landed push follows its row to Pending review, so the keyboard lands on
  // the row that replaced the one pressed (#577, #581).
  const failure = presses.failure();
  const failedId = failure?.id ?? null;
  useEffect(() => {
    if (failedId !== null) setSelected(failedId);
  }, [failedId]);
  const { movedTo } = presses;
  useEffect(() => {
    if (movedTo !== null) setSelected(movedTo);
  }, [movedTo]);

  // The plain read paints the clone before the open-time check has caught it
  // up, so where the clone stands is stated only once a check has answered.
  const checkSettled = refresh.isSuccess || refresh.isError;
  const [checkedOnce, setCheckedOnce] = useState(false);
  useEffect(() => {
    if (checkSettled) {
      setCheckedOnce(true);
    }
  }, [checkSettled]);

  // Opening the view fetches, the same act Re-read Harness repeats. Scheduled
  // rather than called, so StrictMode's replayed first mount cancels its own
  // request in cleanup: one open, one fetch of the author's git refs.
  useEffect(() => {
    const scheduled = setTimeout(fetchRemote);
    return () => clearTimeout(scheduled);
  }, [fetchRemote]);

  const now = new Date();
  const freshness =
    state === undefined ? null : freshnessLabel(state.freshness, now);
  const context = {
    defaultBranch: state?.defaultBranch ?? null,
    releasedVersion: state?.releasedVersion ?? null,
  };
  const columns = useMemo(
    () =>
      harnessColumns({
        context: {
          defaultBranch: context.defaultBranch,
          releasedVersion: context.releasedVersion,
        },
        freshness: freshness ?? "",
      }),
    [context.defaultBranch, context.releasedVersion, freshness],
  );

  // What every row press shares: a read in flight is moving the rows a press
  // would aim at, and the local deletion writes the folders a restore does.
  const localSettled =
    !refresh.isPending &&
    !harness.isFetching &&
    presses.deleteLocal.isPending === false;
  const sections = state === undefined ? [] : stageSections(state, now);
  const rows: HarnessTableRow[] =
    state === undefined
      ? []
      : sections.flatMap((section) =>
          section.read.outcome !== "read"
            ? []
            : section.read.rows
                .map((row) => ({
                  ...row,
                  id: rowId(row),
                  group: section.title,
                  reading: statusReading(row),
                  items: rowItems(
                    row,
                    presses.handlers,
                    // Closed with no answer from the remote: there is no tip
                    // to build on.
                    releaseEnabled(state.freshness) &&
                      localSettled &&
                      presses.promote.isPending === false &&
                      presses.proposalAction.isPending === false,
                    // Recovery reads the clone alone, so the remote's silence
                    // never closes it (#915).
                    {
                      enabled:
                        localSettled && presses.restore.isPending === false,
                      commit: state.localHeadCommit,
                    },
                  ),
                }))
                // Within a stage, the rows that need the author first (#994).
                .sort(
                  (a, b) => readingRank(a.reading) - readingRank(b.reading),
                ),
        );
  const byTitle = (key: string): StageSection | undefined =>
    sections.find((section) => section.title === key);

  const selectedRow = rows.find((row) => row.id === selected) ?? null;
  const openIndex = selected === null ? -1 : order.indexOf(selected);
  const stale =
    state !== undefined && staleStatusNotice(state.freshness, reread) !== null;
  const empty = state !== undefined && journeyConfirmedEmpty(state);

  // Re-read Harness stands even before a first read: it is the way back from
  // a read that failed on open.
  const band2 = (
    <>
      {state === undefined ? null : (
        <dl className="m-0 flex min-w-0 items-center gap-panel text-row">
          <BandFact label="Origin" value={state.origin} yields />
          <BandFact
            label="Released"
            value={state.releasedVersion ?? "None yet"}
            machine={state.releasedVersion !== null}
          />
          <BandFact
            label="Branch"
            value={state.defaultBranch ?? "Unknown"}
            machine={state.defaultBranch !== null}
          />
        </dl>
      )}
      <div className="ml-auto flex flex-none items-center gap-inline">
        {freshness === null ? null : (
          <span
            className={
              stale ? "text-amber-12 text-meta" : "text-gray-11 text-meta"
            }
          >
            {freshness}
          </span>
        )}
        <IconButton
          label={REREAD_HARNESS}
          busy={refresh.isPending}
          onClick={reread}
        >
          {refresh.isPending ? null : (
            <RefreshCw
              aria-hidden="true"
              strokeWidth={1.5}
              className="size-4"
            />
          )}
        </IconButton>
      </div>
    </>
  );

  return (
    <Panel
      title="Harness"
      action={
        state === undefined ? null : (
          <>
            {/* Import touches the working tree only, so no remote answer
                gates it. */}
            <Button
              variant="quiet"
              onClick={importFlow.start}
              // Under 1024px only its icon shows; the name stays (#994).
              className="max-lg:w-8 max-lg:justify-center max-lg:px-0"
            >
              <FolderInput
                aria-hidden="true"
                strokeWidth={1.5}
                className="size-4 lg:hidden"
              />
              <span className="max-lg:sr-only">Import skill…</span>
            </Button>
            {/* Closed while the remote's answer is unknown — an offline or
                failed fetch — and while a re-read is still rewriting the refs
                a plan reads. Advisory findings never gate it (#519). */}
            <Button
              variant="primary"
              disabled={!releaseEnabled(state.freshness) || refresh.isPending}
              onClick={() => setPlanOpen(true)}
            >
              Create a release
            </Button>
          </>
        )
      }
      band2={band2}
    >
      {/* Off-screen, polite: a press moves a row between stages and the table
          repaints under the keyboard, saying nothing (#868). */}
      <span
        role="status"
        aria-live="polite"
        aria-label="Harness stages"
        className="sr-only"
      >
        {state === undefined ? "" : harnessAnnouncement(state, now, reading)}
      </span>
      <div className="relative flex h-[100cqh]">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Notices
            state={state}
            readError={harness.error}
            refreshError={refresh.error}
            checkedOnce={checkedOnce}
            reread={reread}
            published={publish.data}
            rereadInventory={rereadInventory}
            restored={presses.restore.data}
          />
          {empty ? (
            <EmptyState
              icon={
                <FolderGit2
                  aria-hidden="true"
                  strokeWidth={1.5}
                  className="size-4"
                />
              }
              headingLevel={2}
              title={PROPOSAL_EMPTY.journey.title}
              description={PROPOSAL_EMPTY.journey.body}
              action={
                <Button variant="quiet" onClick={importFlow.start}>
                  Import skill…
                </Button>
              }
            />
          ) : state !== undefined || skeleton.visible ? (
            <div
              aria-busy={reading || undefined}
              ref={table.ref}
              className="min-h-0 flex-1 overflow-auto"
            >
              <DataTable
                ref={gridRef}
                label={TABLE_LABEL}
                columns={columns}
                data={rows}
                getRowId={(row) => row.id}
                columnVisibility={table.narrow ? NARROW_HIDDEN : undefined}
                loading={skeleton.visible}
                skeletonRows={Math.min(rows.length || 8, 30)}
                groups={{
                  key: (row) => row.group,
                  order: sections.map((section) => section.title),
                  meta: (key) => groupMeta(byTitle(key)),
                  message: (key) => groupMessage(byTitle(key), reread),
                }}
                openRowId={selectedRow?.id ?? null}
                onRowOpen={(row) =>
                  setSelected(selected === row.id ? null : row.id)
                }
                onRowOrderChange={setOrder}
              />
            </div>
          ) : null}
        </div>
        {selectedRow ? (
          <DetailPaneSlot>
            <StageDetailPane
              row={selectedRow}
              context={context}
              failure={failure?.id === selectedRow.id ? failure.notice : null}
              position={
                openIndex === -1
                  ? null
                  : { index: openIndex, count: order.length }
              }
              onPage={(step) =>
                setSelected(order[openIndex + step] ?? selected)
              }
              onClose={() => setSelected(null)}
              getTriggerElement={getTriggerElement}
            />
          </DetailPaneSlot>
        ) : null}
      </div>
      {state === undefined ? null : (
        <HarnessDialogs
          origin={state.origin}
          importFlow={importFlow}
          onImported={(name) => {
            importFlow.close();
            // An import writes the working tree, so its row is Pending
            // proposal's — even where the skill also holds a later one (#865).
            setSelected(rowId({ stage: "pending-proposal", skill: name }));
          }}
          deletionRow={presses.pendingDeletion}
          deletion={presses.deletion}
          deleteLocal={presses.deleteLocal}
          onDeletionClose={presses.closeConfirmation}
          restoring={presses.restoring}
          restore={presses.restore}
          onRestoreClose={presses.closeRestore}
          withdrawing={presses.withdrawing}
          proposalAction={presses.proposalAction}
          onWithdrawClose={presses.closeWithdrawal}
          planOpen={planOpen}
          plan={plan}
          publish={publish}
          onPlanClose={closePlan}
          onPublish={handlePublish}
        />
      )}
    </Panel>
  );
}

// A band-2 fact (#994): the label, then its value. Only Origin gives way on a
// narrow band: it truncates, and leaves band 2 under 1024px.
function BandFact({
  label,
  value,
  machine = true,
  yields = false,
}: {
  label: string;
  value: string;
  /** False for a plain word such as None yet, which Geist Mono never sets. */
  machine?: boolean;
  yields?: boolean;
}) {
  return (
    <div
      className={
        yields
          ? "flex min-w-0 gap-inline max-lg:hidden"
          : "flex flex-none gap-inline"
      }
    >
      <dt className="flex-none text-gray-11">{label}</dt>
      <dd
        title={value}
        className={
          machine
            ? "m-0 truncate font-mono text-gray-12"
            : "m-0 truncate text-gray-12"
        }
      >
        {value}
      </dd>
    </div>
  );
}

// A stage's header carries its one reading: what was compared and when, or,
// for a stage nobody read, the `?` badge in place of its count (#994).
function groupMeta(section: StageSection | undefined) {
  if (section === undefined) return null;
  return section.read.outcome === "read" ? (
    section.meta
  ) : (
    <StatusBadge reading={reading(section.meta, "unknown")} />
  );
}

// The one line a stage without rows shows: why nobody could read it, or, for
// Pending proposal, the two ways to put a change there. Unknown is never
// drawn as empty (#848, #866).
function groupMessage(section: StageSection | undefined, reread: () => void) {
  if (section === undefined) return null;
  if (section.read.outcome !== "read") {
    const notice = stageReadNotice(section.read, section.meta, reread);
    return notice === null ? null : (
      <>
        <span className="font-medium text-gray-12">{notice.message}</span>
        {notice.detail ? (
          <>
            {" "}
            <span>{notice.detail}</span>
          </>
        ) : null}
      </>
    );
  }
  if (section.stage !== "pending-proposal") return null;
  return (
    <>
      <span className="font-medium text-gray-12">
        {PROPOSAL_EMPTY.stage.title}
      </span>{" "}
      {PROPOSAL_EMPTY.stage.body}
    </>
  );
}

// Notices about the whole screen, above the table (#991).
function Notices({
  state,
  readError,
  refreshError,
  checkedOnce,
  reread,
  published,
  rereadInventory,
  restored,
}: {
  state: ReturnType<typeof useHarness>["data"];
  readError: unknown;
  refreshError: unknown;
  checkedOnce: boolean;
  reread: () => void;
  published: { tag: string; inventoryRefreshed: boolean } | undefined;
  rereadInventory: () => void;
  restored: { hasRequest: boolean; statusRead: boolean } | undefined;
}) {
  const notices = [
    { trigger: "load" as const, notice: harnessStateNotice(readError) },
    // A failed re-read is not a failed read: the state below stands. One
    // notice either way — a stale status is what a refused press left
    // behind, so the two never stack (#848).
    {
      trigger: "load" as const,
      notice:
        (state === undefined
          ? null
          : staleStatusNotice(state.freshness, reread)) ??
        refreshNotice(refreshError),
    },
    {
      trigger: "load" as const,
      notice:
        state === undefined || !checkedOnce
          ? null
          : cloneSyncNotice(state.cloneSync, reread),
    },
    // What the last publication landed. The tag is atomic, so the only half
    // that can fail is the Inventory re-read (#849).
    {
      trigger: "user-action" as const,
      notice:
        published === undefined
          ? null
          : releasePublishedNotice(
              published.tag,
              published.inventoryRefreshed,
              rereadInventory,
            ),
    },
    // What the last restore put back. Above the table, so it outlives the row
    // it was pressed from (#915).
    {
      trigger: "user-action" as const,
      notice:
        restored === undefined
          ? null
          : skillRestoredNotice(
              restored.hasRequest,
              restored.statusRead,
              reread,
            ),
    },
  ];
  // Every region is mounted before its failure is: a region outlives its
  // content, and a read that failed on open is trigger="load" (#465).
  return (
    <div
      className={
        notices.some((each) => each.notice !== null)
          ? "flex flex-col gap-inline p-panel"
          : "flex flex-col"
      }
    >
      {notices.map((each, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: five fixed slots, each always mounted
        <Notice key={index} trigger={each.trigger} notice={each.notice} />
      ))}
    </div>
  );
}
