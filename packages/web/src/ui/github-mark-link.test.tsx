import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { factOnGitHub, GITHUB_COLUMN, viewOnGitHub } from "./github-link-copy";
import { GitHubMarkLink } from "./github-mark-link";

const CAUSE = "The origin of this repository could not be read.";

afterEach(() => {
  vi.useRealTimers();
});

describe("GitHub link copy", () => {
  it("names the column and the link", () => {
    expect(GITHUB_COLUMN).toBe("GitHub");
    expect(viewOnGitHub("maestro")).toBe("View maestro on GitHub");
  });

  // #1182: a fact's value is the link, so its name starts with that value.
  it("names a fact's link by its value", () => {
    expect(factOnGitHub("fimoklei/agent-harness")).toBe(
      "fimoklei/agent-harness on GitHub",
    );
  });
});

describe("GitHubMarkLink", () => {
  it("links GitHub's mark to the page in a new tab, out of the Tab order", () => {
    render(
      <GitHubMarkLink
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

  // Outside a grid there is no ⋮ menu to carry the keyboard's way (#1181).
  it("stays in the Tab order when it is the only way to the page", () => {
    render(
      <GitHubMarkLink
        name="tdd"
        page={{ kind: "link", url: "https://github.com/o/r" }}
        unknownCause={CAUSE}
        focusable={true}
      />,
    );
    expect(
      screen.getByRole("link", { name: "View tdd on GitHub" }),
    ).not.toHaveAttribute("tabindex");
  });

  it("stays empty where there is no page", () => {
    const { container } = render(
      <GitHubMarkLink name="maestro" page={undefined} unknownCause={CAUSE} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows an Unknown badge with its cause in the hover card", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <GitHubMarkLink
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
