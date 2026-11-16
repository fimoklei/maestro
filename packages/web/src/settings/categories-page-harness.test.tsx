import type {
  CategoriesProposalRow,
  CategoryList,
  HarnessCategories,
} from "@maestro/core";
import { screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PULL_REQUEST_ROW } from "../categories/pull-request-copy";
import { jsonResponse, renderWithQuery, sentence } from "../test-utils";
import { CategoriesPage } from "./categories-page";

afterEach(() => {
  vi.unstubAllGlobals();
});

const OWN: CategoryList = {
  categories: [{ name: "Planning", skills: 0, prompts: 0 }],
  assignments: [],
};

function stubServer(harness: HarnessCategories) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/categories") return jsonResponse(OWN);
      if (url === "/api/categories/harness") return jsonResponse(harness);
      if (url === "/api/categories/proposal") {
        return jsonResponse({ state: "start" } satisfies CategoriesProposalRow);
      }
      throw new Error(`unexpected ${url}`);
    }),
  );
}

const renderPage = () =>
  renderWithQuery(
    <MemoryRouter initialEntries={["/settings/categories"]}>
      <CategoriesPage />
    </MemoryRouter>,
  );

const harnessSection = () =>
  screen.findByRole("region", { name: "Harness categories" });

// The own list has rendered, so a missing section is no early read.
const ownListShown = () => screen.findByText("Planning");

describe("Settings › Categories, the Harness categories", () => {
  it.each([
    [6, "The latest Harness release contains 6 categories."],
    [1, "The latest Harness release contains 1 category."],
  ])("states the %i categories of the latest release", async (count, text) => {
    stubServer({ kind: "listed", tag: "v1.5.0", count });
    renderPage();

    const section = await harnessSection();
    expect(await within(section).findByText(text)).toBeInTheDocument();
    expect(within(section).queryByRole("alert")).toBeNull();
  });

  it("names the release whose categories file contains an error, with no close control and no count, and keeps Create pull request", async () => {
    stubServer({ kind: "faulty", tag: "v1.5.0" });
    renderPage();

    const section = await harnessSection();
    expect(
      await within(section).findByText("Couldn't load Harness categories"),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(
        sentence(
          "The categories file in Harness release v1.5.0 contains an error. You can still propose your own categories for review.",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      within(section).queryByRole("button", { name: /^Close/ }),
    ).toBeNull();
    expect(
      await within(section).findByRole("button", {
        name: "Create pull request",
      }),
    ).not.toHaveAttribute("aria-disabled");
    expect(within(section).queryByText(/contains \d+ categor/)).toBeNull();
    expect(screen.getByText("Planning")).toBeInTheDocument();
  });

  // The section stays for its pull-request row.
  it("states that a release without the file contains no categories", async () => {
    stubServer({ kind: "none" });
    renderPage();

    expect(
      await within(await harnessSection()).findByText(
        "The latest Harness release contains no categories.",
      ),
    ).toBeInTheDocument();
  });

  it("states nothing about the release where the Harness could not be read", async () => {
    stubServer({ kind: "unread" });
    renderPage();

    await ownListShown();
    await within(await harnessSection()).findByText(PULL_REQUEST_ROW);
    expect(screen.queryByText(/Harness release/)).toBeNull();
  });
});
