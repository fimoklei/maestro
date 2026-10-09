import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  factOnGitHub,
  GITHUB_COLUMN,
  originNotRead,
  VIEW_REPOSITORY_ON_GITHUB,
  viewOnGitHub,
} from "./github-link-copy";
import { GitHubMarkLink } from "./github-mark-link";

describe("GitHub link copy", () => {
  it("names the column and the link", () => {
    expect(GITHUB_COLUMN).toBe("GitHub");
    expect(viewOnGitHub("maestro")).toBe("View maestro on GitHub");
  });

  // #1180: the column's ⋮ item, and its Unknown cause named by each screen.
  it("names the column's menu item and its Unknown cause", () => {
    expect(VIEW_REPOSITORY_ON_GITHUB).toBe("View repository on GitHub");
    expect(originNotRead("Repositories")).toBe(
      "The origin of this repository could not be read. Select Re-read Repositories to read it again.",
    );
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
        focusable={true}
      />,
    );
    expect(
      screen.getByRole("link", { name: "View tdd on GitHub" }),
    ).not.toHaveAttribute("tabindex");
  });

  it("stays empty where there is no page", () => {
    const { container } = render(
      <GitHubMarkLink name="maestro" page={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
