import type { HarnessStageRow } from "@maestro/core";
import { NoValue } from "../ui/no-value";
import { PullRequestLinkList } from "../ui/pull-request-link";

// The Pull request column and fact (#994): each number is a link to GitHub.
export function PullRequestLinks({ row }: { row: HarnessStageRow }) {
  if (row.requests.length === 0) {
    return <NoValue />;
  }
  // The grid is one Tab stop; the pane's View pull request is the keyboard's
  // way to GitHub.
  return <PullRequestLinkList requests={row.requests} focusable={false} />;
}
