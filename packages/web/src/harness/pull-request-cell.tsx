import type { HarnessStageRow } from "@maestro/core";
import { ArrowUpRight, GitPullRequestArrow } from "lucide-react";
import {
  DataTableCard,
  type DataTableCardContent,
  type DataTableCardFact,
} from "../ui/data-table-card";
import { Icon } from "../ui/icon";
import { MachineValue } from "../ui/machine-value";
import {
  PULL_REQUEST_CARD,
  pullRequestLinkName,
  pullRequestState,
  requestedReviewers,
  reviewWord,
} from "./stage-copy";

// The Pull request column (#994): each number is a link to GitHub.
// Slate, not blue: blue 11 on a hovered row falls under 4.5:1.
export function PullRequestLinks({ row }: { row: HarnessStageRow }) {
  if (row.requests.length === 0) {
    return <span className="text-gray-11">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-inline">
      <Icon of={GitPullRequestArrow} className="flex-none text-gray-11" />
      {row.requests.map((request) => (
        <a
          key={request.number}
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
          <Icon
            of={ArrowUpRight}
            small
            className="opacity-0 group-hover/link:opacity-100"
          />
        </a>
      ))}
    </span>
  );
}

// The column's card (#1445): the numbers and state, then the review facts.
export function pullRequestCard(
  row: HarnessStageRow,
): DataTableCardContent | null {
  // ponytail: several requests match one branch, so the first one's branch
  // stands for all; list each request's branch if they ever differ.
  const [first] = row.requests;
  if (first === undefined) return null;
  const state = pullRequestState(row);
  const review = reviewWord(row);
  const requested = requestedReviewers(row);
  const facts: DataTableCardFact[] = [
    ...(review === null
      ? []
      : [{ label: PULL_REQUEST_CARD.review, value: review }]),
    ...(requested === null
      ? []
      : [{ label: PULL_REQUEST_CARD.requested, value: requested }]),
    {
      label: PULL_REQUEST_CARD.branch,
      value: (
        <>
          <MachineValue>{first.headBranch}</MachineValue>{" "}
          <span aria-hidden="true">→</span>
          <span className="sr-only">{PULL_REQUEST_CARD.into}</span>{" "}
          <MachineValue>{first.baseBranch}</MachineValue>
        </>
      ),
      // A branch name is the fact itself: it wraps, never truncates.
      wrap: true,
    },
  ];
  return {
    value: (
      <>
        {row.requests.map((request) => (
          <MachineValue key={request.number}>#{request.number}</MachineValue>
        ))}
        {state === null ? null : (
          <span className="rounded-chip border border-gray-7 px-tight text-gray-12">
            {state}
          </span>
        )}
      </>
    ),
    body: [],
    facts,
  };
}

// The detail pane's Pull request fact: the same links, with the same card.
export function PullRequestFact({ row }: { row: HarnessStageRow }) {
  const card = pullRequestCard(row);
  const links = <PullRequestLinks row={row} />;
  return card === null ? (
    links
  ) : (
    <DataTableCard content={card} focused={false}>
      {links}
    </DataTableCard>
  );
}
