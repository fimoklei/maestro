import { useEffect } from "react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { HarnessStrip } from "./harness-strip";
import { freshnessLabel, RELEASE_SUMMARIES } from "./harness-view-model";
import { useHarness, useRefreshHarness } from "./use-harness";

// The Harness home base: what the released harness is, how fresh that picture
// is, and whether anything merged is waiting. It leads with state and reads on
// a quiet day (ADR-0021, #516).
export function HarnessView() {
  const harness = useHarness();
  const refresh = useRefreshHarness();
  const { mutate: fetchRemote } = refresh;

  // Opening the view fetches, the same act the Refresh button repeats. A
  // mutation, not a query: it reaches the network and writes git refs.
  useEffect(() => {
    fetchRemote();
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
          <HarnessStrip
            releasedVersion={state.releasedVersion}
            defaultBranch={state.defaultBranch}
            // Read at render, so the age is current every time the strip paints.
            status={freshnessLabel(state.freshness, new Date())}
          >
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
        </>
      )}
    </section>
  );
}
