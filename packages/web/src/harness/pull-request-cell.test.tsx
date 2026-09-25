import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PullRequestCell } from "./pull-request-cell";
import { pullRequest } from "./stage-row-fixture";
import type { HarnessStageRow } from "./use-harness";

const row = (over: Partial<HarnessStageRow> = {}): HarnessStageRow => ({
  stage: "pending-review",
  skill: "code-review",
  status: "changes-requested",
  deletion: false,
  requests: [pullRequest(47, "code-review")],
  reviewers: [
    { kind: "user", login: "sanne" },
    { kind: "user", login: "joris" },
  ],
  comparison: null,
  alsoIn: [],
  concurrentChange: false,
  localOnly: false,
  remoteTree: null,
  restorable: false,
  previousName: null,
  ...over,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PullRequestCell", () => {
  it("links the number to the pull request on GitHub, in a new tab", () => {
    render(<PullRequestCell row={row()} />);

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
      <PullRequestCell
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
    render(<PullRequestCell row={row()} />);

    expect(screen.getByRole("link")).toHaveAttribute("tabindex", "-1");
  });

  it("shows a dash where the row has no pull request", () => {
    render(<PullRequestCell row={row({ requests: [] })} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("sums the request up in its own hover card", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<PullRequestCell row={row()} />);

    fireEvent.pointerEnter(screen.getByRole("link"), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(400));

    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Changes requested")).toBeInTheDocument();
    expect(screen.getByText("@sanne, @joris")).toBeInTheDocument();
    expect(
      screen.getByText("Select #47 to open it on GitHub in a new tab."),
    ).toBeInTheDocument();
    // A summary, never a control (design.md → Disclosure).
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("names the branch the request carries and the branch it goes into", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<PullRequestCell row={row()} />);

    fireEvent.pointerEnter(screen.getByRole("link"), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(400));

    const branch = screen.getByText("Branch").nextElementSibling as HTMLElement;
    expect(within(branch).getByText("maestro/code-review")).toHaveClass(
      "font-mono",
    );
    expect(within(branch).getByText("main")).toHaveClass("font-mono");
    // Heard as "maestro/code-review into main", seen as the arrow.
    expect(within(branch).getByText("→")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(within(branch).getByText("into")).toHaveClass("sr-only");
  });
});
