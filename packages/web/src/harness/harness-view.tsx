import type {
  HarnessPrimitiveType,
  ReleasePlan,
  SemverStep,
} from "@maestro/core";
import { FolderGit2, FolderInput, GitBranch, Tag } from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
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
import { useWriteAction, type WriteResult } from "../ui/use-write-action";
import { cloneSyncNotice } from "./clone-sync-notice";
import { type HarnessTableRow, harnessColumns, rowId } from "./harness-columns";
import { HarnessDialogs } from "./harness-dialogs";
import { type OpenPrimitive, proposalRow } from "./harness-route";
import {
  harnessAnnouncement,
  inFlightNames,
  releaseCause,
  releaseEnabled,
  type StageSection,
  stageSections,
} from "./harness-view-model";
import { harnessPromptReadNotice } from "./import-prompt-copy";
import {
  harnessStateNotice,
  publishReleaseNotice,
  refreshNotice,
  releasePublishedNotice,
  restoredNotice,
  stageReadNotice,
  staleStatusNotice,
} from "./notice-copy";
import { type RowActionHandlers, rowItems } from "./row-actions";
import {
  ALL_RELEASED,
  harnessCounts,
  JOURNEY_EMPTY,
  statusReading,
} from "./stage-copy";
import { StageDetailPane } from "./stage-detail-pane";
import { useEditPromptFlow } from "./use-edit-prompt-flow";
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
  written,
}: {
  /** A primitive another screen sent here, opened in the stage it names. */
  openPrimitive: OpenPrimitive | null;
  /** A write another screen ended here; said once the read under way lands. */
  written: WriteResult | null;
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
    // A write is followed by the Harness read, never by a fetch from GitHub.
    readFailed: harness.isError,
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
  const { open, settle } = table;
  useEffect(() => {
    if (written !== null) settle(written);
  }, [written, settle]);

  const [planOpen, setPlanOpen] = useState(false);
  const plan = useReleasePlan(planOpen);
  const discardPlan = useDiscardReleasePlan();
  const publish = usePublishRelease();
  // An Inventory left unread is the outcome notice above the table instead.
  const publishWrite = useWriteAction(publish, {
    screen: table,
    action: "publish",
    subject: (published) =>
      published.inventoryRefreshed ? { name: published.tag, row: null } : null,
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

  const importFlow = useImportFlow(table, open);
  const promptImportFlow = useImportPromptFlow(table, open);
  const presses = useHarnessPresses(state, table);
  // The edited row's pane opens here; a row the edit removed leaves none.
  const editFlow = useEditPromptFlow({
    screen: "harness",
    writes: table,
    onEdited: (name, written) => {
      table.settle(written);
      open(proposalRow({ type: "prompt", name }));
    },
  });
  const handlers: RowActionHandlers = {
    ...presses.handlers,
    // A read that finds nothing opens no dialog; the row's pane says why.
    edit: (row) => editFlow.start(row.name, () => open(rowId(row))),
  };
  const readRefusal = editFlow.readRefusal;
  const readNotice = (row: HarnessTableRow) =>
    readRefusal === null ||
    row.type !== "prompt" ||
    readRefusal.name !== row.name
      ? null
      : harnessPromptReadNotice(readRefusal.error);

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
  // No other Harness write runs: each takes the lock an edit needs.
  const writesIdle =
    localSettled &&
    presses.promote.isPending === false &&
    presses.proposalAction.isPending === false &&
    presses.restore.isPending === false;
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
                    handlers,
                    // Closed with no answer from the remote: there is no tip
                    // to build on.
                    releaseEnabled(state.freshness) &&
                      localSettled &&
                      presses.promote.isPending === false &&
                      presses.proposalAction.isPending === false,
                    writesIdle,
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

  // A read moves rows between stages and the table repaints under the
  // keyboard, so the move is reported; the first read is not a move (#868).
  // A press's own done sentence outranks it.
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
    if (counts === null || state === undefined) return;
    if (
      !table.settling &&
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
              trigger={
                <BandAction icon={FolderInput} label={IMPORT} menu={true} />
              }
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
              unavailable={releaseCause({
                freshness: state.freshness,
                staleNotice:
                  harnessStateNotice(harness.error) === null
                    ? staleStatusNotice(state.freshness, reread)
                    : null,
                nothingToRelease,
                counts: bandCounts,
              })}
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
        messageText: (key) => {
          const notice = groupNotice(byTitle(key), reread);
          return notice === null
            ? null
            : [notice.message, notice.detail ?? ""]
                .map(plainText)
                .join(" ")
                .trim();
        },
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
          failure={failure?.id === row.id ? failure.notice : readNotice(row)}
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
          categoryFailures={[importFlow.category, promptImportFlow.category]}
          rereadRef={table.rereadRef}
        />
      }
    >
      {state === undefined ? null : (
        <HarnessDialogs
          origin={state.origin}
          importFlow={importFlow}
          promptImportFlow={promptImportFlow}
          editPromptFlow={editFlow}
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
          releaseWithdrawing={presses.releaseWithdrawing}
          releaseWithdrawal={presses.releaseWithdrawalWrite}
          onReleaseWithdrawalClose={presses.closeReleaseWithdrawal}
          planOpen={planOpen}
          plan={plan}
          inFlight={inFlightNames(releaseRead)}
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
function groupNotice(section: StageSection | undefined, reread: () => void) {
  if (section === undefined || section.read.outcome === "read") return null;
  return stageReadNotice(section.read, plainText(section.meta ?? ""), reread);
}

function groupMessage(section: StageSection | undefined, reread: () => void) {
  const notice = groupNotice(section, reread);
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
  categoryFailures,
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
  restored:
    | { type: HarnessPrimitiveType; hasRequest: boolean; statusRead: boolean }
    | undefined;
  dismissRestored: () => void;
  /** An import that landed without the category chosen for it. */
  categoryFailures: readonly {
    failure: NoticeContent | null;
    dismissFailure: () => void;
  }[];
  rereadRef: RefObject<HTMLButtonElement | null>;
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
    ...categoryFailures.map(({ failure, dismissFailure }) => ({
      notice: failure,
      clear: dismissFailure,
    })),
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
  // An import that landed without its category is the reader's own outcome,
  // so it shows under a notice that ranks above it rather than waiting.
  const outranked = categoryFailures.flatMap(
    ({ failure, dismissFailure }, flow) =>
      failure === null || failure === shown?.notice
        ? []
        : [{ flow, failure, dismissFailure }],
  );
  const region = useRef<HTMLDivElement>(null);
  // Focus moves to the next ✕ that stays, else to Re-read.
  const dismissOutranked = (dismissFailure: () => void) => {
    const pressed = document.activeElement;
    const next = [
      ...(region.current?.querySelectorAll<HTMLElement>(
        "[data-notice-close]",
      ) ?? []),
    ].find((button) => button !== pressed);
    if (next === undefined) rereadRef.current?.focus();
    else next.focus();
    dismissFailure();
  };
  // The region outlives its content, so a read that failed on open is
  // announced (#465).
  return (
    <div
      ref={region}
      className={
        shown === undefined
          ? "flex flex-col"
          : "flex flex-col gap-inline p-panel"
      }
    >
      {clear === undefined ? (
        <Notice trigger="load" notice={shown?.notice ?? null} />
      ) : (
        <Notice
          trigger="user-action"
          notice={shown?.notice ?? null}
          onDismiss={dismiss}
        />
      )}
      {outranked.map(({ flow, failure, dismissFailure }) => (
        <Notice
          key={flow}
          trigger="user-action"
          notice={failure}
          onDismiss={() => dismissOutranked(dismissFailure)}
        />
      ))}
    </div>
  );
}
