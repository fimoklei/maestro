import { ArrowUpRight, GitPullRequestArrow } from "lucide-react";
import { HoverCard } from "../ui/hover-card";
import { MachineValue } from "../ui/machine-value";
import {
  PULL_REQUEST_CARD,
  pullRequestLinkName,
  pullRequestState,
  requestedReviewers,
  reviewWord,
} from "./stage-copy";
import type { HarnessStageRow, ReviewRequestLink } from "./use-harness";

// The Pull request column (#994): each number is a link to GitHub with a card
// of its own. Slate, not blue: blue 11 on a hovered row falls under 4.5:1.
export function PullRequestCell({ row }: { row: HarnessStageRow }) {
  if (row.requests.length === 0) {
    return <span className="text-gray-11">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-inline">
      <GitPullRequestArrow
        aria-hidden="true"
        strokeWidth={1.5}
        className="size-4 flex-none text-gray-11"
      />
      {row.requests.map((request) => (
        <HoverCard
          key={request.number}
          content={<RequestCard row={row} request={request} />}
        >
          <a
            href={request.url}
            target="_blank"
            rel="noreferrer"
            // The grid is one Tab stop; the pane's View pull request is the
            // keyboard's way to GitHub.
            tabIndex={-1}
            aria-label={pullRequestLinkName(request.number)}
            className="group/link inline-flex items-center gap-tight text-gray-12 no-underline hover:underline"
          >
            <MachineValue>#{request.number}</MachineValue>
            <ArrowUpRight
              aria-hidden="true"
              strokeWidth={1.5}
              className="size-3 opacity-0 group-hover/link:opacity-100"
            />
          </a>
        </HoverCard>
      ))}
    </span>
  );
}

function RequestCard({
  row,
  request,
}: {
  row: HarnessStageRow;
  request: ReviewRequestLink;
}) {
  const state = pullRequestState(row);
  const review = reviewWord(row);
  const requested = requestedReviewers(row);
  return (
    <div className="flex flex-col gap-inline">
      <div className="flex items-center gap-inline">
        <MachineValue>#{request.number}</MachineValue>
        {state === null ? null : (
          <span className="rounded-chip border border-gray-7 px-tight text-gray-12">
            {state}
          </span>
        )}
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-cell gap-y-tight">
        {review === null ? null : (
          <>
            <dt className="text-gray-11">{PULL_REQUEST_CARD.review}</dt>
            <dd className="m-0">{review}</dd>
          </>
        )}
        {requested === null ? null : (
          <>
            <dt className="text-gray-11">{PULL_REQUEST_CARD.requested}</dt>
            <dd className="m-0">{requested}</dd>
          </>
        )}
        <dt className="text-gray-11">{PULL_REQUEST_CARD.branch}</dt>
        {/* A branch name is the fact itself: it wraps, never truncates. */}
        <dd className="m-0 min-w-0 break-all">
          <MachineValue>{request.headBranch}</MachineValue>{" "}
          <span aria-hidden="true">→</span>
          <span className="sr-only">{PULL_REQUEST_CARD.into}</span>{" "}
          <MachineValue>{request.baseBranch}</MachineValue>
        </dd>
      </dl>
    </div>
  );
}
