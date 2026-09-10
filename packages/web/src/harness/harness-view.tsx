import type { HarnessState } from "@maestro/core";
import { useEffect, useState } from "react";
import { useBrowsePicker } from "../shell/use-browse-picker";
import { useRereadInventory } from "../shell/use-reread-inventory";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Notice } from "../ui/notice";
import { SectionHeader } from "../ui/section-header";
import { HarnessDialogs } from "./harness-dialogs";
import { HarnessStrip } from "./harness-strip";
import {
  freshnessLabel,
  harnessAnnouncement,
  journeyConfirmedEmpty,
  releaseEnabled,
  stageSections,
} from "./harness-view-model";
import {
  harnessStateNotice,
  promoteNotice,
  proposalNotice,
  refreshNotice,
  releasePublishedNotice,
  stageReadNotice,
  staleStatusNotice,
} from "./notice-copy";
import { rowItems } from "./row-actions";
import { PROPOSAL_EMPTY } from "./stage-copy";
import { type StageRowKey, StageTable } from "./stage-table";
import type {
  HarnessStage,
  HarnessStageRow,
  ReleasePlan,
  SemverStep,
} from "./use-harness";
import {
  useDeleteLocalSkill,
  useDiscardReleasePlan,
  useHarness,
  useImportCheck,
  useImportSkill,
  usePromoteDeletion,
  usePromoteSkill,
  useProposalAction,
  usePublishRelease,
  useRefreshHarness,
  useReleasePlan,
} from "./use-harness";

// The Harness home base: what the released harness is, how fresh that picture
// is, and whether anything merged is waiting. It leads with state and reads on
// a quiet day (ADR-0021, #516).
export function HarnessView() {
  const harness = useHarness();
  const state = harness.data;
  const refresh = useRefreshHarness();
  const { mutate: fetchRemote } = refresh;
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
      // published is stated above the strip, which is where the Inventory the
      // release changed is read from (#849).
      {
        onSuccess: () => {
          setPlanOpen(false);
          discardPlan();
        },
      },
    );
  };

  // Import: the picked folder and the name are UI-state; every refusal comes
  // from the server's check, so nothing here decides one (#576).
  const [importOpen, setImportOpen] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  // Null until the author types: Maestro's proposal fills the field until then,
  // and a new folder brings a new proposal.
  const [editedName, setEditedName] = useState<string | null>(null);
  const importCheck = useImportCheck(source, editedName);
  const importSkill = useImportSkill();
  const picker = useBrowsePicker((paths) => {
    setSource(paths[0] ?? null);
    setEditedName(null);
    importSkill.reset();
  });
  // An update's name is the recorded skill's own: provenance decides it, so a
  // name typed before the check came back never travels with it (#732).
  const name =
    importCheck.data?.mode === "update"
      ? importCheck.data.name
      : (editedName ?? importCheck.data?.name ?? "");
  const closeImport = () => {
    setImportOpen(false);
    setSource(null);
    setEditedName(null);
    importSkill.reset();
  };
  // The skill the import confirmation sent the author to. It holds the row on
  // the active surface for about three seconds, long enough to find among the
  // others and short enough not to read as a state of its own (#846).
  const [landedOn, setLandedOn] = useState<string | null>(null);
  useEffect(() => {
    if (landedOn === null) {
      return;
    }
    const done = setTimeout(() => setLandedOn(null), 3000);
    return () => clearTimeout(done);
  }, [landedOn]);
  // An import writes the working tree, so its row is Pending proposal's — even
  // where the same skill also holds a row in the two remote stages (#865).
  const imported: StageRowKey | null =
    landedOn === null ? null : { stage: "pending-proposal", skill: landedOn };

  // Promote: which row is waiting and what the last press refused are read off
  // the mutation. The links are kept beside it, one per skill — a second
  // promotion must not take the first one's way to GitHub with it (#577).
  const promote = usePromoteSkill();
  const promotedSkill = promote.variables?.name ?? null;
  const promoteFailure = promoteNotice(promote.error);
  // The stage the press was made in. Propose change sits in two of them, and a
  // refusal belongs to the row it was pressed from, not to the skill (#865).
  const [promotedFrom, setPromotedFrom] = useState<HarnessStage | null>(null);

  // A deletion never publishes by the row's press alone: it opens a
  // confirmation, which carries the origin/HEAD tree that row was painted
  // from. The pending movement is UI-state; the push is the mutation (#580).
  const deletion = usePromoteDeletion();
  // The other road out of the same confirmation: a skill that exists nowhere
  // else has no deletion to propose, so the folder goes from disk (#798).
  const deleteLocal = useDeleteLocalSkill();
  const [confirming, setConfirming] = useState<string | null>(null);
  const pendingDeletion =
    proposalRows(state).find((row) => row.skill === confirming) ?? null;
  // Left unreset, so a landed deletion still names the row that just moved after
  // its dialog closes. The next press resets it, which is what keeps a refusal
  // from haunting the confirmation after this one (#580, #581).
  const closeConfirmation = () => setConfirming(null);
  // The row that just moved sections, whichever press moved it: a deletion is
  // confirmed in a dialog that unmounts with the row it was opened from, so the
  // promote mutation alone would drop the keyboard on the document (#581). A
  // landed push always lands in Pending review, whichever stage it was pressed
  // in — the branch is now ahead of the default branch (#865).
  const movedTo = (skill: string | null): StageRowKey | null =>
    skill === null ? null : { stage: "pending-review", skill };
  const justMoved = promote.isSuccess
    ? movedTo(promotedSkill)
    : deletion.isSuccess
      ? movedTo(deletion.variables?.name ?? null)
      : null;

  // The three GitHub-side actions share one mutation: only the route differs,
  // and a refusal is stated on the row it was pressed from.
  const proposalAction = useProposalAction();
  const proposalSkill = proposalAction.variables?.name ?? null;
  const proposalFailure = proposalNotice(proposalAction.error);
  // Withdrawal is the one action that confirms first. The number the row
  // showed rides with it; the server rechecks it before closing anything.
  const [withdrawing, setWithdrawing] = useState<{
    skill: string;
    number: number;
  } | null>(null);
  const closeWithdrawal = () => setWithdrawing(null);
  // One refusal at a time, stated on the row the press was made from. A
  // withdrawal's refusal belongs to its dialog, where the confirmation still
  // stands (#577, #580).
  const rowFailure = () => {
    if (
      promoteFailure !== null &&
      promotedSkill !== null &&
      promotedFrom !== null
    ) {
      return {
        row: { stage: promotedFrom, skill: promotedSkill },
        notice: promoteFailure,
      };
    }
    if (
      withdrawing === null &&
      proposalFailure !== null &&
      proposalSkill !== null
    ) {
      // The three GitHub-side actions are Pending review's alone.
      return {
        row: { stage: "pending-review" as const, skill: proposalSkill },
        notice: proposalFailure,
      };
    }
    return null;
  };

  const promoteSkill = (row: HarnessStageRow) => {
    setPromotedFrom(row.stage);
    if (row.deletion) {
      deletion.reset();
      setConfirming(row.skill);
      return;
    }
    promote.mutate({ name: row.skill });
  };

  // Opening the view fetches, the same act Retry check repeats. Scheduled
  // rather than called, so StrictMode's replayed first mount cancels its own
  // request in cleanup: one open, one fetch of the author's git refs.
  useEffect(() => {
    const scheduled = setTimeout(fetchRemote);
    return () => clearTimeout(scheduled);
  }, [fetchRemote]);

  // Returning to the tab is the same act as opening the view: merging happens
  // on GitHub, and the git refs the stages read only move on a fetch. Skipped
  // while one is already running, so a second git fetch is never started (#889).
  const reading = refresh.isPending;
  useEffect(() => {
    if (reading) {
      return;
    }
    const reread = () => fetchRemote();
    window.addEventListener("focus", reread);
    return () => window.removeEventListener("focus", reread);
  }, [reading, fetchRemote]);

  return (
    <section>
      {/* The view's own <h1>: heading navigation needs a starting point, and
          the stages below hang off it (#868). */}
      <SectionHeader level={1} title="Harness" meta={state?.origin} />
      {/* Mounted before either failure is: the region outlives its content,
          and a read that failed on open is trigger="load" (#465). Empty, both
          children are out of flow and the block costs nothing. */}
      <div className="mb-2 flex flex-col gap-2">
        <Notice trigger="load" notice={harnessStateNotice(harness.error)} />
        {/* A failed refresh is not a failed read: the state below stands. One
            notice either way — a stale status is what a refused press left
            behind, so the two never stack (#848). */}
        <Notice
          trigger="load"
          notice={
            (state === undefined
              ? null
              : staleStatusNotice(state.freshness, () => fetchRemote())) ??
            refreshNotice(refresh.error)
          }
        />
        {/* What the last publication landed. The tag is atomic, so the only
            half that can fail is the Inventory re-read, and the notice says
            which of the two happened (#849). */}
        <Notice
          trigger="user-action"
          notice={
            publish.data === undefined
              ? null
              : releasePublishedNotice(
                  publish.data.tag,
                  publish.data.inventoryRefreshed,
                  rereadInventory,
                )
          }
        />
      </div>
      {harness.isError ? null : state === undefined ? (
        <p className="text-dim text-tag">Loading the Harness…</p>
      ) : (
        <>
          <HarnessStrip
            releasedVersion={state.releasedVersion}
            defaultBranch={state.defaultBranch}
            // Read at render, so the age is current every time the strip paints.
            status={freshnessLabel(state.freshness, new Date(), reading)}
          >
            {/* Closed while the remote's answer is unknown — an offline or
                failed fetch (releaseEnabled) — and while a refresh is still
                rewriting the refs a plan reads. Advisory findings and server
                replies never gate it (#519). */}
            <Button
              variant="primary"
              size="sm"
              disabled={!releaseEnabled(state.freshness) || refresh.isPending}
              onClick={() => setPlanOpen(true)}
            >
              Create a release
            </Button>
            <Button
              variant="quiet"
              size="sm"
              // Never disabled by a failed fetch: it is the one way back.
              disabled={refresh.isPending}
              onClick={() => fetchRemote()}
            >
              Retry check
            </Button>
          </HarnessStrip>
          {/* Off-screen, polite: a press moves a row between stages and the
              tables repaint under the keyboard, saying nothing (#868). */}
          <span
            role="status"
            aria-live="polite"
            aria-label="Harness stages"
            className="sr-only"
          >
            {harnessAnnouncement(state, new Date(), reading)}
          </span>
          {/* The three stages in journey order, each answering its own
              question. One skill can hold a row in all three (ADR-0021 · 10). */}
          {stageSections(state, new Date()).map((section) => {
            const rows =
              section.read.outcome === "read" ? section.read.rows : [];
            const proposal = section.stage === "pending-proposal";
            // Only a read stage that holds rows names its count, so a number
            // never appears without rows beside it and can never be mistaken
            // for an unread stage (#827, #881).
            const heading =
              rows.length === 0
                ? section.title
                : `${section.title} · ${rows.length}`;
            const proposalEmpty = journeyConfirmedEmpty(state)
              ? PROPOSAL_EMPTY.journey
              : PROPOSAL_EMPTY.stage;
            // Import touches the working tree only, so no remote answer gates
            // it — and an unread stage still has a way to put work in it.
            const importAction = proposal ? (
              <Button
                variant="quiet"
                size="sm"
                onClick={() => setImportOpen(true)}
              >
                Import skill…
              </Button>
            ) : null;
            // A confirmed empty stage is absent altogether, except Pending
            // proposal, which always renders because it hosts Import skill….
            if (
              !proposal &&
              section.read.outcome === "read" &&
              rows.length === 0
            ) {
              return null;
            }
            // A stage nobody could read draws no card, no count and no rows: a
            // zero must never read as an unknown (#848). Its reading moves out
            // of the meta slot into a notice, which is where the cockpit states
            // a cause and a next step (#866).
            if (section.read.outcome !== "read") {
              return (
                <section key={section.stage} className="mt-4">
                  <SectionHeader level={2} size={3} title={section.title}>
                    {importAction}
                  </SectionHeader>
                  <Notice
                    trigger="load"
                    notice={stageReadNotice(section.read, section.meta, () =>
                      fetchRemote(),
                    )}
                  />
                </section>
              );
            }
            return (
              <section key={section.stage} className="mt-4">
                <SectionHeader
                  level={2}
                  size={3}
                  title={heading}
                  meta={section.meta}
                >
                  {importAction}
                </SectionHeader>
                <Card>
                  {rows.length === 0 ? (
                    <div className="p-card-x">
                      <p className="m-0 font-medium text-desc text-fg">
                        {proposalEmpty.title}
                      </p>
                      <p className="m-0 mt-1 text-desc text-muted">
                        {proposalEmpty.body}
                      </p>
                    </div>
                  ) : (
                    <StageTable
                      title={section.title}
                      rows={rows}
                      context={{
                        defaultBranch: state.defaultBranch,
                        releasedVersion: state.releasedVersion,
                      }}
                      actions={{
                        items: (row) =>
                          rowItems(
                            row,
                            {
                              promote: promoteSkill,
                              create: (skill) =>
                                proposalAction.mutate({
                                  action: "create",
                                  name: skill,
                                }),
                              reopen: (skill, number) =>
                                proposalAction.mutate({
                                  action: "reopen",
                                  name: skill,
                                  number,
                                }),
                              withdraw: (skill, number) => {
                                proposalAction.reset();
                                setWithdrawing({ skill, number });
                              },
                              deleteLocal: (skill) => {
                                deleteLocal.reset();
                                setConfirming(skill);
                              },
                            },
                            // Closed with no answer from the remote: there is
                            // no tip to build on, and a read in flight is
                            // moving the rows a press would aim at.
                            releaseEnabled(state.freshness) &&
                              !refresh.isPending &&
                              !harness.isFetching &&
                              promote.isPending === false &&
                              proposalAction.isPending === false &&
                              deleteLocal.isPending === false,
                          ),
                        failed: rowFailure(),
                        // Focusing the row's menu is what scrolls it into
                        // view: the platform already does that for focus().
                        focus: imported ?? justMoved,
                        highlight: imported,
                      }}
                    />
                  )}
                </Card>
              </section>
            );
          })}
          <HarnessDialogs
            origin={state.origin}
            importOpen={importOpen}
            source={source}
            name={name}
            importCheck={importCheck}
            importSkill={importSkill}
            onPickSource={picker.openBrowse}
            onNameChange={setEditedName}
            onImport={() =>
              source !== null && importSkill.mutate({ source, name })
            }
            onImported={(name) => {
              closeImport();
              setLandedOn(name);
            }}
            onImportClose={closeImport}
            picker={picker}
            deletionRow={pendingDeletion}
            deletion={deletion}
            deleteLocal={deleteLocal}
            onDeletionClose={closeConfirmation}
            withdrawing={withdrawing}
            proposalAction={proposalAction}
            onWithdrawClose={closeWithdrawal}
            planOpen={planOpen}
            plan={plan}
            publish={publish}
            onPlanClose={closePlan}
            onPublish={handlePublish}
          />
        </>
      )}
    </section>
  );
}

// Pending proposal's rows, or none where the stage could not be read: a press
// aimed at a row nobody read is refused here rather than sent.
function proposalRows(state: HarnessState | undefined): HarnessStageRow[] {
  const stage = state?.stages.proposal;
  return stage?.outcome === "read" ? stage.rows : [];
}
