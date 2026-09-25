import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubLinkCell } from "./github-link-cell";
import { GITHUB_COLUMN, viewOnGitHub } from "./github-link-copy";

const CAUSE = "The origin of this repository could not be read.";

afterEach(() => {
  vi.useRealTimers();
});

describe("GitHub link copy", () => {
  it("names the column and the link", () => {
    expect(GITHUB_COLUMN).toBe("GitHub");
    expect(viewOnGitHub("maestro")).toBe("View maestro on GitHub");
  });
});

describe("GitHubLinkCell", () => {
  it("links GitHub's mark to the page in a new tab, out of the Tab order", () => {
    render(
      <GitHubLinkCell
        name="maestro"
        page={{ kind: "link", url: "https://github.com/o/maestro" }}
        unknownCause={CAUSE}
      />,
    );
    const link = screen.getByRole("link", { name: "View maestro on GitHub" });
    expect(link).toHaveAttribute("href", "https://github.com/o/maestro");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(link).toHaveAttribute("tabindex", "-1");
  });

  it("stays empty where there is no page", () => {
    const { container } = render(
      <GitHubLinkCell name="maestro" page={undefined} unknownCause={CAUSE} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an Unknown badge with its cause in the hover card", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <GitHubLinkCell
        name="maestro"
        page={{ kind: "unknown" }}
        unknownCause={CAUSE}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.pointerEnter(screen.getByText("Unknown"), {
      pointerType: "mouse",
    });
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByText(CAUSE)).toBeInTheDocument();
  });
});
