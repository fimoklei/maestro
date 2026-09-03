import { useEffect, useState } from "react";
import { BrowseDialog } from "../shell/browse-dialog";
import { useBrowsePicker } from "../shell/use-browse-picker";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Notice } from "../ui/notice";
import { SectionHeader } from "../ui/section-header";
import { DeletionDialog } from "./deletion-dialog";
import { HarnessStrip } from "./harness-strip";
import {
  freshnessLabel,
  movementSections,
  RELEASE_SUMMARIES,
  releaseEnabled,
} from "./harness-view-model";
import { type ImportCheckLoad, ImportDialog } from "./import-dialog";
import { MovementTable } from "./movement-table";
import {
  harnessStateNotice,
  importNotice,
  promoteNotice,
  publishReleaseNotice,
  refreshNotice,
  releasePlanNotice,
  removalNotice,
} from "./notice-copy";
import { PendingRelease } from "./pending-release";
import { ReleaseDialog, type ReleasePlanLoad } from "./release-dialog";
import type { ReleasePlan, SemverStep } from "./use-harness";
import {
  useDiscardReleasePlan,
  useHarness,
  useImportCheck,
  useImportSkill,
  usePromoteDeletion,
  usePromoteSkill,
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
      { onSuccess: closePlan },
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

  // Promote: which row is waiting and what the last press refused are read off
  // the mutation. The links are kept beside it, one per skill — a second
  // promotion must not take the first one's way to GitHub with it (#577).
  const promote = usePromoteSkill();
  const [pullRequests, setPullRequests] = useState<Record<string, string>>({});
  const promotedSkill = promote.variables?.name ?? null;
  const promoteFailure = promoteNotice(promote.error);
  const keepLink = (name: string) => (outcome: { pullRequestUrl: string }) =>
    setPullRequests((links) => ({ ...links, [name]: outcome.pullRequestUrl }));

  // A removal never publishes by the row's press alone: it opens a
  // confirmation, which carries the origin/HEAD tree that row was painted
  // from. The pending movement is UI-state; the push is the mutation (#580).
  const removal = usePromoteDeletion();
  const [confirming, setConfirming] = useState<string | null>(null);
  const pendingDeletion =
    state?.movements.find((movement) => movement.skill === confirming) ?? null;
  // Left unreset, so a landed removal still names the row that just moved after
  // its dialog closes. The next press resets it, which is what keeps a refusal
  // from haunting the confirmation after this one (#580, #581).
  const closeConfirmation = () => setConfirming(null);
  // The row that just moved sections, whichever press moved it: a deletion is
  // confirmed in a dialog that unmounts with the row it was opened from, so the
  // promote mutation alone would drop the keyboard on the document (#581).
  const justMoved = promote.isSuccess
    ? promotedSkill
    : removal.isSuccess
      ? (removal.variables?.name ?? null)
      : null;

  const promoteSkill = (name: string) => {
    const movement = state?.movements.find((each) => each.skill === name);
    if (movement?.deletion === true) {
      removal.reset();
      setConfirming(name);
      return;
    }
    promote.mutate({ name }, { onSuccess: keepLink(name) });
  };

  // Opening the view fetches, the same act the Refresh button repeats. A
  // mutation, not a query: it reaches the network and writes git refs.
  // Scheduled rather than called, so StrictMode's replayed first mount cancels
  // its own request in cleanup: one open, one fetch of the author's git refs.
  useEffect(() => {
    const scheduled = setTimeout(fetchRemote);
    return () => clearTimeout(scheduled);
  }, [fetchRemote]);

  return (
    <section>
      <SectionHeader title="Harness" meta={state?.origin} />
      {/* Mounted before either failure is: the region outlives its content,
          and a read that failed on open is trigger="load" (#465). Empty, both
          children are out of flow and the block costs nothing. */}
      <div className="mb-2 flex flex-col gap-2">
        <Notice trigger="load" notice={harnessStateNotice(harness.error)} />
        {/* A failed refresh is not a failed read: the state below stands. */}
        <Notice trigger="load" notice={refreshNotice(refresh.error)} />
      </div>
      {harness.isError ? null : state === undefined ? (
        <p className="text-dim text-tag">Loading the Harness…</p>
      ) : (
        <>
          <HarnessStrip
            releasedVersion={state.releasedVersion}
            defaultBranch={state.defaultBranch}
            // Read at render, so the age is current every time the strip paints.
            status={freshnessLabel(state.freshness, new Date())}
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
              Plan release
            </Button>
            <Button
              variant="quiet"
              size="sm"
              // Never disabled by a failed fetch: it is the one way back.
              disabled={refresh.isPending}
              onClick={() => fetchRemote()}
            >
              Refresh
            </Button>
            {/* Import touches the working tree only, so no remote answer gates
                it — what lands shows up under Pending promotion. */}
            <Button
              variant="quiet"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              Import skill…
            </Button>
          </HarnessStrip>
          <Card className="mt-3" padded>
            <p className="m-0 font-mono text-desc text-muted">
              {RELEASE_SUMMARIES[state.releaseState]}
            </p>
          </Card>
          {/* The three tables in the order the route runs backwards: what a
              release carries out, then what it does not touch (#347). */}
          <PendingRelease movements={state.pendingRelease} />
          {movementSections(state.movements).map((section) => (
            <section key={section.state} className="mt-4">
              <SectionHeader
                level={3}
                title={section.title}
                meta={`${section.movements.length} · ${section.meta}`}
              />
              <Card>
                <MovementTable
                  movements={section.movements}
                  promote={{
                    onPromote: promoteSkill,
                    // The rule that closes Release: with no answer from the
                    // remote there is no tip to build the commit on. A refresh
                    // or a re-read in flight is moving the very rows a press
                    // would be aimed at.
                    enabled:
                      releaseEnabled(state.freshness) &&
                      !refresh.isPending &&
                      !harness.isFetching,
                    pending: promote.isPending ? promotedSkill : null,
                    pullRequests,
                    justMoved,
                    failed:
                      promoteFailure === null || promotedSkill === null
                        ? null
                        : { skill: promotedSkill, notice: promoteFailure },
                  }}
                />
              </Card>
            </section>
          ))}
          {importOpen && !picker.open ? (
            <ImportDialog
              source={source}
              name={name}
              load={importLoad(source, importCheck)}
              onPickSource={picker.openBrowse}
              onNameChange={setEditedName}
              onClose={closeImport}
              // The dialog stays open on success: it is where the import's
              // outcome is stated, and closing would take that with it.
              onImport={() =>
                source !== null && importSkill.mutate({ source, name })
              }
              imported={importSkill.data ?? null}
              importing={importSkill.isPending}
              importError={importNotice(importSkill.error)}
            />
          ) : null}
          {picker.open ? (
            <BrowseDialog
              mode="import-source"
              onSelect={picker.selectBrowse}
              onClose={picker.closeBrowse}
            />
          ) : null}
          {pendingDeletion !== null && pendingDeletion.remoteTree !== null ? (
            <DeletionDialog
              skill={pendingDeletion.skill}
              origin={state.origin}
              seenRemoteTree={pendingDeletion.remoteTree}
              onClose={closeConfirmation}
              // The dialog closes on success only: a refusal is stated in it,
              // and the way forward is another confirmation (#580).
              onConfirm={() =>
                removal.mutate(
                  {
                    name: pendingDeletion.skill,
                    seenRemoteTree: pendingDeletion.remoteTree as string,
                  },
                  {
                    onSuccess: (outcome) => {
                      keepLink(pendingDeletion.skill)(outcome);
                      closeConfirmation();
                    },
                  },
                )
              }
              removing={removal.isPending}
              removeError={removalNotice(removal.error)}
            />
          ) : null}
          {planOpen ? (
            <ReleaseDialog
              origin={state.origin}
              load={planLoad(plan)}
              onClose={closePlan}
              onPublish={handlePublish}
              publishing={publish.isPending}
              publishError={publishReleaseNotice(publish.error)}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

// Idle until a folder is picked: with nothing to judge there is no refusal to
// state, and "loading" would claim a request that was never made.
function importLoad(
  source: string | null,
  check: ReturnType<typeof useImportCheck>,
): ImportCheckLoad {
  if (source === null) {
    return { kind: "idle" };
  }
  if (check.data !== undefined) {
    return { kind: "ready", check: check.data };
  }
  const failed = importNotice(check.error);
  if (failed !== null) {
    return { kind: "error", notice: failed };
  }
  return { kind: "loading" };
}

// The dialog stays mounted through loading, error, and the ready plan, so the
// query's three states become its one prop.
function planLoad(plan: ReturnType<typeof useReleasePlan>): ReleasePlanLoad {
  if (plan.data !== undefined) {
    return { kind: "ready", plan: plan.data };
  }
  const failed = releasePlanNotice(plan.error);
  if (failed !== null) {
    return { kind: "error", notice: failed };
  }
  return { kind: "loading" };
}
