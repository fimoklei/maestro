import type { HarnessStageRow } from "@maestro/core";
import { ArrowUpRight, GitPullRequestArrow } from "lucide-react";
import { Icon } from "../ui/icon";
import { MachineValue } from "../ui/machine-value";
import { NoValue } from "../ui/no-value";
import { pullRequestLinkName } from "./stage-copy";

// The Pull request column and fact (#994): each number is a link to GitHub.
// Slate, not blue: blue 11 on a hovered row falls under 4.5:1.
export function PullRequestLinks({ row }: { row: HarnessStageRow }) {
  if (row.requests.length === 0) {
    return <NoValue />;
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
