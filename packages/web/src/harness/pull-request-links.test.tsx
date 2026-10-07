import type { HarnessStageRow } from "@maestro/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PullRequestLinks } from "./pull-request-links";
import { pullRequest } from "./stage-row-fixture";

const row = (over: Partial<HarnessStageRow> = {}): HarnessStageRow => ({
  stage: "pending-review",
  skill: "code-review",
  status: "changes-requested",
  change: "edit",
  requests: [pullRequest(47, "code-review")],
  reviewers: [
    { kind: "user", login: "sanne" },
    { kind: "user", login: "joris" },
  ],
  comparison: null,
  alsoIn: [],
  concurrentChange: false,
  waitingOn: null,
  localOnly: false,
  remoteTree: null,
  restorable: false,
  folderOnDisk: false,
  previousName: null,
  ...over,
});

describe("PullRequestLinks", () => {
  it("links the number to the pull request on GitHub, in a new tab", () => {
    render(<PullRequestLinks row={row()} />);

    const link = screen.getByRole("link", {
      name: "Pull request #47, opens in a new tab",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/fimoklei/agent-harness/pull/47",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveTextContent("#47");
  });

  it("gives every matching request its own link", () => {
    render(
      <PullRequestLinks
        row={row({
          status: "multiple-pull-requests",
          requests: [pullRequest(51), pullRequest(52)],
        })}
      />,
    );

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      ["#51", "#52"],
    );
  });

  it("stays out of the grid's one Tab stop", () => {
    // The detail pane's View pull request is the keyboard's way to GitHub.
    render(<PullRequestLinks row={row()} />);

    expect(screen.getByRole("link")).toHaveAttribute("tabindex", "-1");
  });

  it("shows a dash where the row has no pull request", () => {
    render(<PullRequestLinks row={row({ requests: [] })} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
