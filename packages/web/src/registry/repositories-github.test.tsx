import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { htmlElement } from "../test-utils";
import {
  type FakeRegistry,
  renderRepositories,
  stubRegistry,
} from "./repositories-test-helpers";

// The GitHub column (#1456): the page Deploy-state links, from the same
// deploy-state read.

afterEach(() => {
  vi.unstubAllGlobals();
});

const REPO = "/home/me/acme-web";
const NAME = "…/me/acme-web";
const URL = "https://github.com/acme/web";

const githubCell = async (name: string) => {
  const grid = await screen.findByRole("grid", { name: "Repositories table" });
  const headers = within(grid)
    .getAllByRole("columnheader")
    .map((header) => header.textContent);
  const row = (await within(grid).findByText(name)).closest("tr");
  if (row === null) throw new Error(`no row for ${name}`);
  return htmlElement(
    within(row).getAllByRole("gridcell")[headers.indexOf("GitHub")],
  );
};

const openMenu = async (name: string) => {
  const row = htmlElement((await screen.findByText(name)).closest("tr"));
  await userEvent.click(
    within(row).getByRole("button", { name: `Actions for ${name}` }),
  );
  return screen.findAllByRole("menuitem");
};

const linked = (): FakeRegistry => ({
  repos: [{ path: REPO, status: "ready" }],
  github: { [REPO]: { kind: "link", url: URL } },
});

describe("Repositories — GitHub column", () => {
  it("links a repository to its GitHub page with GitHub's mark, mouse only", async () => {
    stubRegistry(linked());
    renderRepositories();

    const link = await within(await githubCell(NAME)).findByRole("link", {
      name: `View ${NAME} on GitHub`,
    });
    expect(link).toHaveAttribute("href", URL);
    expect(link).toHaveAttribute("tabindex", "-1");
  });

  it("offers the same page in the row's menu, before Unregister", async () => {
    stubRegistry(linked());
    renderRepositories();
    await within(await githubCell(NAME)).findByRole("link");

    const items = await openMenu(NAME);

    expect(items.map((item) => item.textContent)).toEqual([
      "View Deploy-state",
      "View repository on GitHub",
      "Unregister",
    ]);
    expect(
      screen.getByRole("menuitem", { name: "View repository on GitHub" }),
    ).toHaveAttribute("href", URL);
  });

  it("leaves a repository without a GitHub page empty, with no menu item", async () => {
    stubRegistry({ repos: [{ path: "/home/me/scratch", status: "ready" }] });
    renderRepositories();

    expect(await githubCell("…/me/scratch")).toBeEmptyDOMElement();
    const items = await openMenu("…/me/scratch");
    expect(items.map((item) => item.textContent)).toEqual([
      "View Deploy-state",
      "Unregister",
    ]);
  });

  it("shows a failed origin read as its own Unknown badge, its cause to the pointer", async () => {
    stubRegistry({
      repos: [{ path: REPO, status: "ready" }],
      github: { [REPO]: { kind: "unknown" } },
    });
    renderRepositories();

    const cell = await githubCell(NAME);
    await waitFor(() => expect(cell).toHaveTextContent("Unknown"));
    await userEvent.hover(within(cell).getByText("Unknown"));

    expect(
      await screen.findByText(
        "The origin of this repository could not be read. Select Re-read Repositories to read it again.",
      ),
    ).toBeInTheDocument();
  });

  it("re-reads the GitHub page with Re-read Repositories", async () => {
    const state: FakeRegistry = {
      repos: [{ path: REPO, status: "ready" }],
      github: { [REPO]: { kind: "unknown" } },
    };
    stubRegistry(state);
    renderRepositories();
    const cell = await githubCell(NAME);
    await waitFor(() => expect(cell).toHaveTextContent("Unknown"));

    state.github = linked().github;
    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Repositories" }),
    );

    expect(
      await within(await githubCell(NAME)).findByRole("link", {
        name: `View ${NAME} on GitHub`,
      }),
    ).toHaveAttribute("href", URL);
  });
});
