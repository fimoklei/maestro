import type {
  CategoriesProposalRow,
  CopyFacts,
  CopyPreview,
  HarnessCategories,
} from "@maestro/core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { harnessAnswer } from "../settings/harness-location-test-helpers";
import {
  expectDescription,
  jsonResponse,
  renderWithQuery,
  sentence,
} from "../test-utils";
import { AppRoutes } from "./app-router";

afterEach(() => {
  vi.unstubAllGlobals();
});

const SIGNAL = "Harness categories have changed";

const ADDS_BOTH: CopyFacts = {
  added: ["Planning", "Review"],
  deleted: [],
  unchanged: [],
  respelled: [],
  moved: { skills: 0, prompts: 0 },
  uncategorised: { skills: 0, prompts: 0 },
};

const PREVIEW: CopyPreview = {
  tag: "v1.5.0",
  count: 2,
  skipped: 0,
  choice: false,
  modes: { add: ADDS_BOTH, replace: ADDS_BOTH },
  fresh: [],
};

// A connected cockpit whose latest release changed the Harness categories
// until the copy dialog opens, as the server records it seen then.
function stubServer({ changed }: { changed: boolean }) {
  let seen = !changed;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/categories") {
        return jsonResponse({ categories: [], assignments: [] });
      }
      if (url === "/api/categories/harness") {
        return jsonResponse({
          kind: "listed",
          tag: "v1.5.0",
          count: 2,
          changed: !seen,
        } satisfies HarnessCategories);
      }
      if (url === "/api/categories/proposal") {
        return jsonResponse({ state: "empty" } satisfies CategoriesProposalRow);
      }
      if (url === "/api/categories/harness/preview") {
        seen = true;
        return jsonResponse(PREVIEW);
      }
      if (url.startsWith("/api/harness")) return harnessAnswer("v1.5.0");
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse({ inventoryPath: "/home/me/agent-harness" });
      }
      return jsonResponse({
        ok: true,
        repos: [],
        primitives: [],
        skipped: [],
        behind: [],
      });
    }),
  );
}

const renderApp = (path: string) =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );

const categoriesInSidebar = async () =>
  within(
    await screen.findByRole("complementary", { name: "Settings" }),
  ).getByRole("button", { name: "Categories" });

describe("the Harness categories change signal", () => {
  it("marks the Harness menu button and Settings in its menu", async () => {
    stubServer({ changed: true });
    renderApp("/");

    const button = await screen.findByRole("button", { name: "Harness menu" });
    await vi.waitFor(() => expectDescription(button, SIGNAL));
    await userEvent.click(button);

    expectDescription(
      await screen.findByRole("menuitem", { name: "Settings" }),
      SIGNAL,
    );
  });

  it("marks Categories in the Settings sidebar and names the release in a notice without controls", async () => {
    stubServer({ changed: true });
    renderApp("/settings/categories");

    await vi.waitFor(async () =>
      expectDescription(await categoriesInSidebar(), SIGNAL),
    );
    const section = await screen.findByRole("region", {
      name: "Harness categories",
    });
    expect(within(section).getByText(SIGNAL)).toBeInTheDocument();
    expect(
      within(section).getByText(
        sentence(
          "Release v1.5.0 changed the Harness categories. Select Copy to compare them with your list before anything changes.",
        ),
      ),
    ).toBeInTheDocument();
    // The notice has no control of its own; Copy is the row's.
    const notice = within(section)
      .getByText(SIGNAL)
      .closest('[role="status"], [role="alert"]');
    expect(notice).not.toBeNull();
    expect(within(notice as HTMLElement).queryAllByRole("button")).toEqual([]);
    expect(
      within(section).getByRole("button", { name: "Copy Harness categories" }),
    ).toBeInTheDocument();
  });

  it("clears the dot and the notice once the copy dialog opened, without a copy", async () => {
    stubServer({ changed: true });
    renderApp("/settings/categories");
    const section = await screen.findByRole("region", {
      name: "Harness categories",
    });
    await within(section).findByText(SIGNAL);

    await userEvent.click(
      within(section).getByRole("button", { name: "Copy Harness categories" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Copy Harness categories",
    });
    await within(dialog).findByText(/has 2 categories/);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    await vi.waitFor(() =>
      expect(within(section).queryByText(SIGNAL)).toBeNull(),
    );
    expectDescription(await categoriesInSidebar(), "");
  });

  it("shows no dot and no notice for categories the operator has seen", async () => {
    stubServer({ changed: false });
    renderApp("/settings/categories");

    const section = await screen.findByRole("region", {
      name: "Harness categories",
    });
    expect(within(section).queryByText(SIGNAL)).toBeNull();
    expectDescription(await categoriesInSidebar(), "");
  });
});
