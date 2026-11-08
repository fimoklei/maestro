import { ArrowUpRight, GitPullRequestArrow } from "lucide-react";
import { pullRequestLinkName } from "./github-link-copy";
import { Icon } from "./icon";
import { MachineValue } from "./machine-value";

type PullRequestRef = { number: number; url: string };

// The pull-request icon, then each number as a link to GitHub in a new tab.
// Slate, not blue: blue 11 on a hovered row falls under 4.5:1.
export function PullRequestLinkList({
  requests,
  focusable,
}: {
  requests: readonly PullRequestRef[];
  /** False inside a grid, which is one Tab stop with its own keyboard way to GitHub. */
  focusable: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-inline">
      <Icon of={GitPullRequestArrow} className="flex-none text-gray-11" />
      {requests.map((request) => (
        <a
          key={request.number}
          href={request.url}
          target="_blank"
          rel="noreferrer"
          tabIndex={focusable ? undefined : -1}
          aria-label={pullRequestLinkName(request.number)}
          className="group/link inline-flex items-center gap-tight rounded-control text-gray-12 no-underline hover:underline focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2"
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
