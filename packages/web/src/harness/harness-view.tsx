import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { HarnessStrip } from "./harness-strip";
import {
  freshnessLabel,
  movementSections,
  RELEASE_SUMMARIES,
  releaseEnabled,
} from "./harness-view-model";
import { MovementTable } from "./movement-table";
import { PendingRelease } from "./pending-release";
import { ReleaseDialog, type ReleasePlanLoad } from "./release-dialog";
import {
  useDiscardReleasePlan,
  useHarness,
  useRefreshHarness,
  useReleasePlan,
} from "./use-harness";

// The Harness home base: what the released harness is, how fresh that picture
// is, and whether anything merged is waiting. It leads with state and reads on
// a quiet day (ADR-0021, #516).
export function HarnessView() {
  const harness = useHarness();
  const refresh = useRefreshHarness();
  const { mutate: fetchRemote } = refresh;
  // Plan open/closed is UI-state; the plan itself is fetched only while the
  // dialog is open (frontend.md).
  const [planOpen, setPlanOpen] = useState(false);
  const plan = useReleasePlan(planOpen);
  const discardPlan = useDiscardReleasePlan();
  const closePlan = () => {
    setPlanOpen(false);
    discardPlan();
  };

  // Opening the view fetches, the same act the Refresh button repeats. A
  // mutation, not a query: it reaches the network and writes git refs.
  // Scheduled rather than called, so StrictMode's replayed first mount cancels
  // its own request in cleanup: one open, one fetch of the author's git refs.
  useEffect(() => {
    const scheduled = setTimeout(fetchRemote);
    return () => clearTimeout(scheduled);
  }, [fetchRemote]);

  const state = harness.data;

  return (
    <section>
      <SectionHeader title="Harness" meta={state?.origin} />
      {harness.isError ? (
        <p role="alert" className="text-amber-ink text-tag">
          {harness.error.message}
        </p>
      ) : state === undefined ? (
        <p className="text-dim text-tag">Loading the harness…</p>
      ) : (
        <>
          {refresh.isError ? (
            // A failed refresh is not a failed read: the state below stands,
            // and saying nothing would let it pass as freshly fetched.
            <p role="alert" className="mb-2 text-amber-ink text-tag">
              Refresh failed: {refresh.error.message}
            </p>
          ) : null}
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
              release
            </Button>
            <Button
              variant="quiet"
              size="sm"
              // Never disabled by a failed fetch: it is the one way back.
              disabled={refresh.isPending}
              onClick={() => fetchRemote()}
            >
              refresh
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
                <MovementTable movements={section.movements} />
              </Card>
            </section>
          ))}
          {planOpen ? (
            <ReleaseDialog
              origin={state.origin}
              load={planLoad(plan)}
              onClose={closePlan}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

// The dialog stays mounted through loading, error, and the ready plan, so the
// query's three states become its one prop.
function planLoad(plan: ReturnType<typeof useReleasePlan>): ReleasePlanLoad {
  if (plan.data !== undefined) {
    return { kind: "ready", plan: plan.data };
  }
  if (plan.isError) {
    return { kind: "error", message: plan.error.message };
  }
  return { kind: "loading" };
}
