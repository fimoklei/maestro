import type {
  HarnessPrimitiveType,
  ReleasePlan,
  SemverStep,
} from "@maestro/core";
import { FolderGit2, FolderInput, GitBranch, Tag } from "lucide-react";
import {
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRereadInventory } from "../shell/use-reread-inventory";
import { ActionsMenu } from "../ui/actions-menu";
import { BandAction } from "../ui/band-action";
import {
  BRANCH_FACT,
  NOT_RELEASED_YET,
  ORIGIN_FACT,
  RELEASE_FACT,
  UNKNOWN_FACT_VALUE,
} from "../ui/band-copy";
import { Button } from "../ui/button";
import {
  CREATE_RELEASE,
  IMPORT,
  IMPORT_PROMPT,
  IMPORT_SKILL,
} from "../ui/control-labels";
import { useFreshnessLine } from "../ui/freshness";
import { GatedButton } from "../ui/gated-button";
import { GitHubMark } from "../ui/github-mark-link";
import { Icon } from "../ui/icon";
import { Notice, type NoticeContent } from "../ui/notice";
import { plainText } from "../ui/phrase";
import { PhraseText } from "../ui/phrase-text";
import { StatusBadge } from "../ui/status-badge";
import { reading, readingRank } from "../ui/status-reading";
import { TableScreen } from "../ui/table-screen";
import { useTableScreen } from "../ui/use-table-screen";
import { useWriteAction } from "../ui/use-write-action";
import { cloneSyncNotice } from "./clone-sync-notice";
import { type HarnessTableRow, harnessColumns, rowId } from "./harness-columns";
import { HarnessDialogs } from "./harness-dialogs";
import type { OpenPrimitive } from "./harness-route";
import {
  harnessAnnouncement,
  releaseEnabled,
  type StageSection,
  stageSections,
} from "./harness-view-model";
import {
  harnessStateNotice,
  publishReleaseNotice,
  refreshNotice,
  releasePublishedNotice,
  restoredNotice,
  stageReadNotice,
  staleStatusNotice,
} from "./notice-copy";
import { rowItems } from "./row-actions";
import {
  ALL_RELEASED,
  harnessCounts,
  JOURNEY_EMPTY,
  statusReading,
} from "./stage-copy";
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
import { useImportPromptFlow } from "./use-import-prompt-flow";

// Band 2 widths in rem, tuned in `pnpm smoke`: the labels go first, then the
// counts; the dot and Read never drop.
const LABELS_BELOW_REM = 62;
const COUNTS_BELOW_REM = 20;

export function HarnessView({
  openPrimitive,
}: {
  /** A primitive another screen sent here, opened in the stage it names. */
  openPrimitive: OpenPrimitive | null;
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
      openPrimitive === null
        ? null
        : rowId({
            ...openPrimitive,
            stage: openPrimitive.stage ?? "pending-proposal",
          }),
  });
  const reread = table.reread;
  const { open } = table;

  // What a blocked Create a release points at: the notice, else band 2's
  // reading, or its Pending release count.
  const noticeId = useId();
  const readingId = useId();
  const releaseCountId = useId();
  const [planOpen, setPlanOpen] = useState(false);
  const plan = useReleasePlan(planOpen);
  const discardPlan = useDiscardReleasePlan();
  const publish = usePublishRelease();
  // An Inventory left unread is the outcome notice above the table instead.
  const publishWrite = useWriteAction(publish, {
    report: table.report,
    action: "publish",
    show: "toast",
    name: (published) => (published.inventoryRefreshed ? published.tag : null),
    failure: publishReleaseNotice,
  });
  const rereadInventory = useRereadInventory();
  const closePlan = () => {
    setPlanOpen(false);
    discardPlan();
    // A failed attempt must not haunt the next time this dialog opens.
    publish.reset();
  };
  const handlePublish = (step: SemverStep, plan: ReleasePlan) => {
    publishWrite.run(
      {
        step,
        previousTag: plan.previousTag,
        previousTagCommit: plan.previousTagCommit,
        revision: plan.revision,
      },
      // The dialog closes on success and keeps no result of its own (#849).
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
  const importFlow = useImportFlow(table.report, ({ name }) => {
    // An import writes the working tree, so its row is Pending proposal's —
    // even where the skill also holds a later one (#865).
    open(rowId({ stage: "pending-proposal", type: "skill", name }));
    importSaid.current = true;
  });
  const promptImportFlow = useImportPromptFlow(table.report, ({ name }) => {
    open(rowId({ stage: "pending-proposal", type: "prompt", name }));
    importSaid.current = true;
  });
  const presses = useHarnessPresses(state, table.report);

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
        },
  );
  const context = {
    defaultBranch: state?.defaultBranch ?? null,
    releasedVersion: state?.releasedVersion ?? null,
    origin: state?.origin ?? "",
  };
  const columns = useMemo(
    () =>
      harnessColumns({
        context: {
          defaultBranch: context.defaultBranch,
          releasedVersion: context.releasedVersion,
          origin: context.origin,
        },
        freshness,
      }),
    [context.defaultBranch, context.releasedVersion, context.origin, freshness],
  );

  // What every row press shares: a read in flight is moving the rows a press
  // would aim at, and the local deletion writes the folders a restore does.
  const localSettled =
    !refresh.isPending &&
    !harness.isFetching &&
    presses.deleteLocal.isPending === false &&
    presses.discard.isPending === false;
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
                    presses.running?.id === rowId(row) ? presses.running : null,
                  ),
                }))
                // Within a stage, the rows that need the author first (#994).
                .sort(
                  (a, b) => readingRank(a.reading) - readingRank(b.reading),
                ),
        );
  const bandCounts = harnessCounts(
    sections.flatMap((section) =>
      section.read.outcome === "read"
        ? section.read.rows.map(() => section.stage)
        : [],
    ),
    releaseCountId,
  );
  // The stages read the same release diff as the plan, so a confirmed 0 here
  // is an empty dialog there.
  const releaseRead = sections.find(
    (section) => section.stage === "pending-release",
  )?.read;
  const nothingToRelease =
    releaseRead?.outcome === "read" && releaseRead.rows.length === 0;
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

  return (
    <TableScreen
      state={table}
      action={
        state === undefined ? null : (
          <>
            {/* Both items open a dialog, so focus returns to Import, its opener. */}
            <ActionsMenu
              label={IMPORT}
              trigger={<BandAction icon={FolderInput} label={IMPORT} menu />}
              items={[
                { label: IMPORT_SKILL, onSelect: importFlow.start },
                { label: IMPORT_PROMPT, onSelect: promptImportFlow.start },
              ]}
            />
            {/* Closed while the remote's answer is unknown — an offline or
                failed fetch. Open during a re-read: Publish release checks
                every ref against the remote. Advisory findings never gate it
                (#519). */}
            <GatedButton
              variant="primary"
              label={CREATE_RELEASE}
              unavailable={
                !releaseEnabled(state.freshness)
                  ? {
                      describedBy:
                        harnessStateNotice(harness.error) === null &&
                        staleStatusNotice(state.freshness, reread) !== null
                          ? noticeId
                          : readingId,
                    }
                  : nothingToRelease
                    ? {
                        // Every count at 0 reads All released instead.
                        describedBy: bandCounts.every(
                          (count) => count.count === 0,
                        )
                          ? readingId
                          : releaseCountId,
                      }
                    : null
              }
              onClick={() => setPlanOpen(true)}
            />
          </>
        )
      }
      band={{
        facts:
          state === undefined
            ? []
            : [
                {
                  label: ORIGIN_FACT,
                  icon: <GitHubMark />,
                  value: state.origin,
                  github: state.github,
                  machine: true,
                  drop: { rank: 2, belowRem: 48 },
                },
                {
                  label: RELEASE_FACT,
                  icon: <Icon of={Tag} />,
                  value: state.releasedVersion ?? NOT_RELEASED_YET,
                  machine: state.releasedVersion !== null,
                  drop: { rank: 3, belowRem: 24 },
                },
                {
                  label: BRANCH_FACT,
                  icon: <Icon of={GitBranch} />,
                  value: state.defaultBranch ?? UNKNOWN_FACT_VALUE,
                  machine: state.defaultBranch !== null,
                  drop: { rank: 1, belowRem: 54 },
                },
              ],
        summary: {
          freshness:
            state === undefined
              ? { readAt: [], outcome: harness.isError ? "fetch-failed" : null }
              : {
                  readAt: [state.freshness.lastFetchedAt],
                  outcome: state.freshness.outcome,
                },
          healthy: ALL_RELEASED,
          counts: bandCounts,
        },
        labelsBelowRem: LABELS_BELOW_REM,
        countsBelowRem: COUNTS_BELOW_REM,
        wordId: readingId,
      }}
      rereading={refresh.isPending}
      firstReadRows={8}
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
        icon: <Icon of={FolderGit2} />,
        title: JOURNEY_EMPTY.title,
        description: JOURNEY_EMPTY.body,
        action: (
          <Button variant="quiet" onClick={importFlow.start}>
            {IMPORT_SKILL}
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
          noticeId={noticeId}
        />
      }
    >
      {state === undefined ? null : (
        <HarnessDialogs
          origin={state.origin}
          importFlow={importFlow}
          promptImportFlow={promptImportFlow}
          deletionRow={presses.pendingDeletion}
          deletion={presses.deletionWrite}
          onDeletionClose={presses.closeConfirmation}
          localDeletion={presses.localDeletion}
          deleteLocal={presses.deleteLocalWrite}
          onLocalDeletionClose={presses.closeLocalDeletion}
          restoring={presses.restoring}
          restore={presses.restoreWrite}
          onRestoreClose={presses.closeRestore}
          discarding={presses.discarding}
          discard={presses.discardWrite}
          onDiscardClose={presses.closeDiscard}
          defaultBranch={state.defaultBranch}
          withdrawing={presses.withdrawing}
          proposalAction={presses.proposalWrite}
          onWithdrawClose={presses.closeWithdrawal}
          planOpen={planOpen}
          plan={plan}
          publish={publishWrite}
          onPlanClose={closePlan}
          onPublish={handlePublish}
        />
      )}
    </TableScreen>
  );
}

function groupMeta(section: StageSection | undefined) {
  if (section === undefined) return null;
  return section.read.outcome === "read" ? (
    section.meta === null ? null : (
      <PhraseText copy={section.meta} />
    )
  ) : (
    <StatusBadge reading={reading(plainText(section.meta ?? ""), "unknown")} />
  );
}

// Unknown is never drawn as empty (#848, #866).
function groupMessage(section: StageSection | undefined, reread: () => void) {
  if (section === undefined || section.read.outcome === "read") return null;
  const notice = stageReadNotice(
    section.read,
    plainText(section.meta ?? ""),
    reread,
  );
  return notice === null ? null : (
    <>
      <span className="font-medium text-gray-12">
        <PhraseText copy={notice.message} />
      </span>
      {notice.detail ? (
        <>
          {" "}
          <span>
            <PhraseText copy={notice.detail} />
          </span>
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
  noticeId,
}: {
  state: ReturnType<typeof useHarness>["data"];
  readError: unknown;
  refreshError: unknown;
  checkedOnce: boolean;
  reread: () => void;
  published: { tag: string; inventoryRefreshed: boolean } | undefined;
  dismissPublished: () => void;
  rereadInventory: () => void;
  restored:
    | { type: HarnessPrimitiveType; hasRequest: boolean; statusRead: boolean }
    | undefined;
  dismissRestored: () => void;
  rereadRef: RefObject<HTMLButtonElement | null>;
  noticeId: string;
}) {
  // One notice, the one that blocks most; the next shows once it clears.
  // A full success is a toast, so only a partial one reaches the band.
  const candidates: {
    notice: NoticeContent | null;
    clear?: () => void;
  }[] = [
    { notice: harnessStateNotice(readError) },
    // A failed re-read is not a failed read: the state below stands. A stale
    // status is what a refused press left behind (#848).
    {
      notice:
        (state === undefined
          ? null
          : staleStatusNotice(state.freshness, reread)) ??
        refreshNotice(refreshError),
    },
    {
      notice:
        published === undefined || published.inventoryRefreshed
          ? null
          : releasePublishedNotice(published.tag, rereadInventory),
      clear: dismissPublished,
    },
    // Above the table, so it outlives the row it was pressed from (#915).
    {
      notice:
        restored === undefined || restored.statusRead
          ? null
          : restoredNotice(restored.type, restored.hasRequest, reread),
      clear: dismissRestored,
    },
    {
      notice:
        state === undefined || !checkedOnce
          ? null
          : cloneSyncNotice(state.cloneSync, reread),
    },
  ];
  const shown = candidates.find((each) => each.notice !== null);
  const clear = shown?.clear;
  // The next closable notice draws in this one's place, so focus stays on
  // its ✕; with none to follow, focus goes to Re-read.
  const dismiss = () => {
    const next = candidates.find(
      (each) => each !== shown && each.notice !== null,
    );
    if (next?.clear === undefined) rereadRef.current?.focus();
    clear?.();
  };
  // The region outlives its content, so a read that failed on open is
  // announced (#465).
  return (
    <div className={shown === undefined ? "flex flex-col" : "p-panel"}>
      {clear === undefined ? (
        <Notice id={noticeId} trigger="load" notice={shown?.notice ?? null} />
      ) : (
        <Notice
          id={noticeId}
          trigger="user-action"
          notice={shown?.notice ?? null}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}
