import type { HarnessStageRow } from "@maestro/core";
import { Chip } from "../ui/chip";
import type {
  DataTableCardContent,
  DataTableCardFact,
} from "../ui/data-table-card";
import { MachineValue } from "../ui/machine-value";
import {
  PULL_REQUEST_CARD,
  pullRequestState,
  requestedReviewers,
  reviewWord,
} from "./stage-copy";

/** The Pull request column's card: the numbers and state, then the facts. */
export function pullRequestCard(
  row: HarnessStageRow,
): DataTableCardContent | null {
  if (row.requests.length === 0) return null;
  const state = pullRequestState(row);
  const review = reviewWord(row);
  const requested = requestedReviewers(row);
  // With several requests, each branch is told apart by its number.
  const several = row.requests.length > 1;
  const facts: DataTableCardFact[] = [
    ...(review === null
      ? []
      : [{ label: PULL_REQUEST_CARD.review, value: review }]),
    ...(requested === null
      ? []
      : [{ label: PULL_REQUEST_CARD.requested, value: requested }]),
    ...row.requests.map((request) => ({
      label: PULL_REQUEST_CARD.branch,
      value: (
        <>
          {several ? (
            <>
              <MachineValue>#{request.number}</MachineValue>{" "}
            </>
          ) : null}
          <MachineValue>{request.headBranch}</MachineValue>{" "}
          <span aria-hidden="true">→</span>
          <span className="sr-only">{PULL_REQUEST_CARD.into}</span>{" "}
          <MachineValue>{request.baseBranch}</MachineValue>
        </>
      ),
    })),
  ];
  return {
    value: (
      <>
        {row.requests.map((request) => (
          <MachineValue key={request.number}>#{request.number}</MachineValue>
        ))}
        {state === null ? null : <Chip>{state}</Chip>}
      </>
    ),
    facts,
    readAge: null,
  };
}
