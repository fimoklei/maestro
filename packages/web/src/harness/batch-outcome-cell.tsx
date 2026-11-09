import { Spinner } from "../ui/button";
import { PullRequestLinkList } from "../ui/pull-request-link";
import { NOT_PROPOSED, PROPOSED } from "./propose-batch-copy";
import type { RunningState } from "./propose-batch-view";

// What one item's row shows while the batch runs.
export function BatchOutcomeCell({ standing }: { standing: RunningState }) {
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
