import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cellsOf,
  factValue,
  findRow,
  GITHUB_CELL,
  openPane,
  renderDeployState,
  rowOf,
  stubServer,
} from "./deploy-state-test-helpers";

// The GitHub column (#1180): a Consuming repo links to its own GitHub page.

afterEach(() => {
  vi.unstubAllGlobals();
});

const REPO = "/Users/me/maestro";
const NAME = "…/me/maestro";
const URL = "https://github.com/fimoklei/maestro";
const TOOLS = {
  tools: [{ tool: "claude", primitives: [] }],
  skipped: [],
};

const serve = (github?: unknown) =>
  stubServer(() => ({
    repos: [REPO],
    global: TOOLS,
    repo: {
      [REPO]: {
        primitives: [],
        skipped: [],
        ...(github === undefined ? {} : { github }),
      },
    },
  }));

const githubCell = (name: string) =>
  within(rowOf(name)).getAllByRole("gridcell")[GITHUB_CELL] as HTMLElement;

describe("Deploy-state — GitHub column", () => {
  it("links a repository to its GitHub page with GitHub's mark, mouse only", async () => {
    serve({ kind: "link", url: URL });
    renderDeployState();
    await findRow(NAME);

    expect(
      screen
        .getAllByRole("columnheader")
        .map((header) => header.textContent)
        .slice(0, 4),
    ).toEqual(["Target", "Release", "GitHub", "Status"]);
    const link = await within(githubCell(NAME)).findByRole("link", {
      name: `View ${NAME} on GitHub`,
    });
    expect(link).toHaveAttribute("href", URL);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("tabindex", "-1");
  });

  // #1272: in the pane, the page is GitHub's mark beside the Path fact.
  it("offers the same page in the row's menu and beside the pane's Path", async () => {
    serve({ kind: "link", url: URL });
    renderDeployState();

    await userEvent.click(
      within(await findRow(NAME)).getByRole("button", {
        name: `Actions for ${NAME}`,
      }),
    );
    const item = await screen.findByRole("menuitem", {
      name: "View repository on GitHub",
    });
    expect(item).toHaveAttribute("href", URL);
    await userEvent.keyboard("{Escape}");

    const pane = await openPane(NAME);
    const mark = within(factValue(pane, "Path") as HTMLElement).getByRole(
      "link",
      {
        name: `View ${NAME} on GitHub`,
      },
    );
    expect(mark).toHaveAttribute("href", URL);
    expect(mark).not.toHaveAttribute("tabindex");
    expect(
      within(pane).queryByRole("link", { name: "View repository on GitHub" }),
    ).toBeNull();
  });

  it("leaves Global and a repository without a GitHub page empty, with no menu item", async () => {
    serve();
    renderDeployState();
    await findRow(NAME);

    expect(githubCell(NAME)).toBeEmptyDOMElement();
    expect(githubCell("Claude Code")).toBeEmptyDOMElement();
    await userEvent.click(
      within(rowOf(NAME)).getByRole("button", {
        name: `Actions for ${NAME}`,
      }),
    );
    await screen.findByRole("menuitem", { name: "Deploy skill" });
    expect(
      screen.queryByRole("menuitem", { name: "View repository on GitHub" }),
    ).toBeNull();
  });

  it("shows a failed origin read as its own Unknown badge, the row's status untouched", async () => {
    serve({ kind: "unknown" });
    renderDeployState();
    await findRow(NAME);

    await waitFor(() => expect(cellsOf(NAME)[2]).toBe("Empty"));
    expect(githubCell(NAME)).toHaveTextContent("Unknown");
    expect(within(githubCell(NAME)).queryByRole("link")).toBeNull();

    const pane = await openPane(NAME);
    expect(
      within(pane).getByText(/The origin of this repository could not be read/),
    ).toBeInTheDocument();
  });

  // design.md → Disclosure: the active row opens one card, the Status card,
  // and it carries the Unknown badge's cause.
  it("opens the Status card alone on the repository's row, with the origin's cause", async () => {
    serve({ kind: "unknown" });
    renderDeployState();
    await findRow(NAME);
    await waitFor(() => expect(cellsOf(NAME)[2]).toBe("Empty"));

    act(() => screen.getByRole("grid").focus());
    await userEvent.keyboard("{ArrowDown}");

    const cause = await screen.findByText(
      "The origin of this repository could not be read. Select Re-read Deploy-state to read it again.",
    );
    const card = cause.closest("[data-radix-popper-content-wrapper]");
    expect(card).toHaveTextContent(/^Empty/);
    // The row the cursor left closes its card 150 ms later.
    await waitFor(() =>
      expect(
        document.querySelectorAll("[data-radix-popper-content-wrapper]"),
      ).toHaveLength(1),
    );
  });

  it("opens the Unknown badge's own cause to the pointer", async () => {
    serve({ kind: "unknown" });
    renderDeployState();
    await findRow(NAME);

    await userEvent.hover(within(githubCell(NAME)).getByText("Unknown"));

    const cause = await screen.findByText(
      /The origin of this repository could not be read/,
    );
    expect(
      cause.closest("[data-radix-popper-content-wrapper]"),
    ).not.toHaveTextContent("Empty");
    // A declared card's body: full strength, as on every table card.
    expect(cause.closest("p")).toHaveClass("text-gray-12");
  });
});
