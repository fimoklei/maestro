import type { CategoryList, HarnessCategories } from "@maestro/core";
import { screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  screen.queryByRole("region", { name: "Harness categories" });

// The own list has rendered, so a missing section is no early read.
const ownListShown = () => screen.findByText("Planning");

describe("Settings › Categories, the Harness categories", () => {
  it.each([
    [6, "The latest Harness release contains 6 categories."],
    [1, "The latest Harness release contains 1 category."],
  ])("states the %i categories of the latest release", async (count, text) => {
    stubServer({ kind: "listed", tag: "v1.5.0", count });
    renderPage();

    const section = await screen.findByRole("region", {
      name: "Harness categories",
    });
    expect(within(section).getByText(text)).toBeInTheDocument();
    expect(within(section).queryByRole("alert")).toBeNull();
  });

  it("names the release whose categories file contains an error, with no close control and no count", async () => {
    stubServer({ kind: "faulty", tag: "v1.5.0" });
    renderPage();

    const section = await screen.findByRole("region", {
      name: "Harness categories",
    });
    expect(
      within(section).getByText("Couldn't load Harness categories"),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(
        sentence(
          "The categories file in Harness release v1.5.0 contains an error. You can still propose your own categories for review.",
        ),
      ),
    ).toBeInTheDocument();
    expect(within(section).queryByRole("button")).toBeNull();
    expect(within(section).queryByText(/contains \d+ categor/)).toBeNull();
    expect(screen.getByText("Planning")).toBeInTheDocument();
  });

  it.each<[string, HarnessCategories]>([
    ["no file or no release", { kind: "none" }],
    ["a Harness it could not read", { kind: "unread" }],
  ])("states nothing about Harness categories for %s", async (_, harness) => {
    stubServer(harness);
    renderPage();

    await ownListShown();
    expect(harnessSection()).toBeNull();
    expect(screen.queryByText(/Harness release/)).toBeNull();
  });
});
