import type { GitHubPage, ReleasePlan, SemverStep } from "@maestro/core";
import { FolderGit2, FolderInput } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useRereadInventory } from "../shell/use-reread-inventory";
import { doneSentence } from "../ui/busy-copy";
import { Button } from "../ui/button";
import { useFreshnessLine } from "../ui/freshness";
import { GitHubFactLink } from "../ui/github-fact-link";
import { Notice } from "../ui/notice";
import { StatusBadge } from "../ui/status-badge";
import { reading, readingRank } from "../ui/status-reading";
import { TableScreen } from "../ui/table-screen";
import { useTableScreen } from "../ui/use-table-screen";
import { cloneSyncNotice } from "./clone-sync-notice";
import { type HarnessTableRow, harnessColumns, rowId } from "./harness-columns";
import { HarnessDialogs } from "./harness-dialogs";
import {
  harnessAnnouncement,
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
import { JOURNEY_EMPTY, statusReading } from "./stage-copy";
import { StageDetailPane } from "./stage-detail-pane";
import {
  useDiscardReleasePlan,
  useHarness,
  usePublishRelease,
  useRefreshHarness,
  useReleasePlan,
} from "./use-harness";
import { useHarnessPresses } from "./use-harness-presses";
import { useImportFlow } from "./use-import-flow";

export function HarnessView({
  openSkill,
}: {
  /** A skill that just landed elsewhere, opened as its Pending proposal. */
  openSkill: string | null;
}) {
  const harness = useHarness();
  const state = harness.data;
  const refresh = useRefreshHarness();
  const { mutate: fetchRemote } = refresh;
  const reading = refresh.isPending || harness.isFetching;
  // The one way back from every failed read, so a failure never closes it.
  const table = useTableScreen({
    name: "Harness",
    reading: reading || (state === undefined && !harness.isError),
    settled: state !== undefined,
    failure: harnessStateNotice(harness.error) ?? refreshNotice(refresh.error),
    onReread: fetchRemote,
    openOnArrival:
      openSkill === null
        ? null
        : rowId({ stage: "pending-proposal", skill: openSkill }),
  });
  const reread = table.reread;
  const { open } = table;

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

  // The import's done sentence already says what moved. It lands before the
  // import's own re-read paints, so that read reports no move (#1160).
  const importSaid = useRef(false);
  const importFlow = useImportFlow(({ name }) => {
    // An import writes the working tree, so its row is Pending proposal's —
    // even where the skill also holds a later one (#865).
    open(rowId({ stage: "pending-proposal", skill: name }));
    importSaid.current = true;
    table.report(doneSentence("import", name));
  });
  const presses = useHarnessPresses(state);

  // A refused press is stated in its row's pane, which opens to show it; a
  // landed push follows its row to Pending review, so the keyboard lands on
  // the row that replaced the one pressed (#577, #581).
  const failure = presses.failure();
  const failedId = failure?.id ?? null;
  useEffect(() => {
    if (failedId !== null) open(failedId);
  }, [failedId, open]);
  const { movedTo } = presses;
  useEffect(() => {
    if (movedTo !== null) open(movedTo);
  }, [movedTo, open]);

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

  const freshness = useFreshnessLine(
    state === undefined
      ? null
      : {
          readAt: [state.freshness.lastFetchedAt],
          outcome: state.freshness.outcome,
          reading: false,
        },
  );
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
  const sections = state === undefined ? [] : stageSections(state);
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

  // A press moves a row between stages and the table repaints under the
  // keyboard, so the move is reported; the first read is not a move (#868).
  const counts =
    state === undefined
      ? null
      : sections
          .map((section) =>
            section.read.outcome === "read" ? section.read.rows.length : "?",
          )
          .join(" ");
  const heardCounts = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires on each landed read
  useEffect(() => {
    const said = importSaid.current;
    importSaid.current = false;
    if (counts === null || state === undefined) return;
    if (
      !said &&
      heardCounts.current !== null &&
      heardCounts.current !== counts
    ) {
      table.report(harnessAnnouncement(state, new Date()));
    }
    heardCounts.current = counts;
  }, [harness.dataUpdatedAt]);

  const stale =
    state !== undefined && staleStatusNotice(state.freshness, reread) !== null;

  return (
    <TableScreen
      state={table}
      action={
        state === undefined ? null : (
          <>
            <Button
              variant="quiet"
              onClick={importFlow.start}
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
      lead={
        state === undefined ? null : (
          <dl className="m-0 flex min-w-0 items-center gap-panel text-row">
            <BandFact
              label="Origin"
              value={state.origin}
              github={state.github}
              yields="lg"
            />
            <BandFact
              label="Released"
              value={state.releasedVersion ?? "None yet"}
              machine={state.releasedVersion !== null}
            />
            <BandFact
              label="Branch"
              value={state.defaultBranch ?? "Unknown"}
              machine={state.defaultBranch !== null}
              yields="sm"
            />
          </dl>
        )
      }
      freshness={
        freshness === null ? null : (
          <span
            className={
              stale ? "text-amber-12 text-meta" : "text-gray-11 text-meta"
            }
          >
            {freshness}
          </span>
        )
      }
      rereading={refresh.isPending}
      rows={rows}
      columns={columns}
      rowId={(row) => row.id}
      groups={{
        key: (row) => row.group,
        order: sections.map((section) => section.title),
        meta: (key) => groupMeta(byTitle(key)),
        message: (key) => groupMessage(byTitle(key), reread),
      }}
      empty={{
        icon: (
          <FolderGit2 aria-hidden="true" strokeWidth={1.5} className="size-4" />
        ),
        title: JOURNEY_EMPTY.title,
        description: JOURNEY_EMPTY.body,
        action: (
          <Button variant="quiet" onClick={importFlow.start}>
            Import skill…
          </Button>
        ),
      }}
      pane={(row, frame) => (
        <StageDetailPane
          row={row}
          context={context}
          failure={failure?.id === row.id ? failure.notice : null}
          {...frame}
        />
      )}
      notice={
        <Notices
          state={state}
          readError={harness.error}
          refreshError={refresh.error}
          checkedOnce={checkedOnce}
          reread={reread}
          published={publish.data}
          dismissPublished={publish.reset}
          rereadInventory={rereadInventory}
          restored={presses.restore.data}
          dismissRestored={presses.restore.reset}
          rereadRef={table.rereadRef}
        />
      }
    >
      {state === undefined ? null : (
        <HarnessDialogs
          origin={state.origin}
          importFlow={importFlow}
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
    </TableScreen>
  );
}

// Every fact truncates rather than run under the freshness line (#1204); a
// yielding fact leaves band 2 below its breakpoint.
const YIELDS = { sm: "max-sm:hidden", lg: "max-lg:hidden" } as const;

function BandFact({
  label,
  value,
  machine = true,
  yields,
  github,
}: {
  label: string;
  value: string;
  /** Links the value to its GitHub page. */
  github?: GitHubPage;
  /** False for a plain word such as None yet, which Geist Mono never sets. */
  machine?: boolean;
  yields?: keyof typeof YIELDS;
}) {
  return (
    <div className={`flex min-w-0 gap-inline ${yields ? YIELDS[yields] : ""}`}>
      <dt className="flex-none text-gray-11">{label}</dt>
      <dd
        title={value}
        className={
          machine
            ? "m-0 truncate font-mono text-gray-12"
            : "m-0 truncate text-gray-12"
        }
      >
        <GitHubFactLink page={github} value={value} />
      </dd>
    </div>
  );
}

function groupMeta(section: StageSection | undefined) {
  if (section === undefined) return null;
  return section.read.outcome === "read" ? (
    section.meta
  ) : (
    <StatusBadge reading={reading(section.meta ?? "", "unknown")} />
  );
}

// Unknown is never drawn as empty (#848, #866).
function groupMessage(section: StageSection | undefined, reread: () => void) {
  if (section === undefined || section.read.outcome === "read") return null;
  const notice = stageReadNotice(section.read, section.meta ?? "", reread);
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

function Notices({
  state,
  readError,
  refreshError,
  checkedOnce,
  reread,
  published,
  dismissPublished,
  rereadInventory,
  restored,
  dismissRestored,
  rereadRef,
}: {
  state: ReturnType<typeof useHarness>["data"];
  readError: unknown;
  refreshError: unknown;
  checkedOnce: boolean;
  reread: () => void;
  published: { tag: string; inventoryRefreshed: boolean } | undefined;
  dismissPublished: () => void;
  rereadInventory: () => void;
  restored: { hasRequest: boolean; statusRead: boolean } | undefined;
  dismissRestored: () => void;
  rereadRef: RefObject<HTMLButtonElement | null>;
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
  ];
  const outcomes = [
    // The tag is atomic, so only the Inventory re-read can fail (#849).
    {
      notice:
        published === undefined
          ? null
          : releasePublishedNotice(
              published.tag,
              published.inventoryRefreshed,
              rereadInventory,
            ),
      clear: dismissPublished,
    },
    // Above the table, so it outlives the row it was pressed from (#915).
    {
      notice:
        restored === undefined
          ? null
          : skillRestoredNotice(
              restored.hasRequest,
              restored.statusRead,
              reread,
            ),
      clear: dismissRestored,
    },
  ];
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  // Focus leaves the control it stood on, so it goes to the next outcome
  // still standing, else to the one re-read control.
  const dismiss = (index: number) => {
    const next = outcomes.findIndex(
      (each, at) => at !== index && each.notice !== null,
    );
    const target =
      next === -1
        ? rereadRef.current
        : (slots.current[next]?.querySelector<HTMLElement>(
            "[data-notice-close]",
          ) ?? null);
    target?.focus();
    outcomes[index]?.clear();
  };
  // Every region is mounted before its failure is: a region outlives its
  // content, and a read that failed on open is trigger="load" (#465).
  return (
    <div
      className={
        [...notices, ...outcomes].some((each) => each.notice !== null)
          ? "flex flex-col gap-inline p-panel"
          : "flex flex-col"
      }
    >
      {notices.map((each, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: five fixed slots, each always mounted
        <Notice key={index} trigger={each.trigger} notice={each.notice} />
      ))}
      {outcomes.map((each, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: two fixed slots, each always mounted
          key={index}
          ref={(slot) => {
            slots.current[index] = slot;
          }}
          className="contents"
        >
          <Notice
            trigger="user-action"
            notice={each.notice}
            onDismiss={() => dismiss(index)}
          />
        </div>
      ))}
    </div>
  );
}
