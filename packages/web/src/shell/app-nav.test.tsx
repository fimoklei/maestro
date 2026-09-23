import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { AppRoutes } from "./app-router";

afterEach(() => {
  vi.unstubAllGlobals();
});

// The harness read has its own shape, so it answers separately: the catch-all
// body would reach the Harness view without the fields it renders.
const HARNESS_STATE = {
  origin: "github.com/fimoklei/agent-harness",
  releasedVersion: "v0.5.0",
  defaultBranch: "main",
  releaseState: "released",
  freshness: { outcome: null, lastFetchedAt: null },
  stages: {
    proposal: { outcome: "read", rows: [], bound: null },
    review: { outcome: "read", rows: [], bound: null },
    release: { outcome: "read", rows: [], bound: null },
  },
};

function stubEmptyServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/harness")
        ? jsonResponse(HARNESS_STATE, 200)
        : jsonResponse(
            { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
            200,
          ),
    ),
  );
}

// A configured server: the sidebar's Harness menu holds Settings, so the
// Harness location page is reachable from the frame (#995) rather than a nav
// item of its own.
function stubConfiguredServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200);
      }
      if (url.startsWith("/api/harness")) {
        return jsonResponse(HARNESS_STATE, 200);
      }
      return jsonResponse(
        { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
        200,
      );
    }),
  );
}

function renderApp(path = "/") {
  return renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("cockpit navigation", () => {
  it("swaps the main region from Deploy-state to Inventory on nav click", async () => {
    stubEmptyServer();
    renderApp();

    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Inventory" }));

    expect(
      await screen.findByRole("heading", { name: /^inventory$/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /deploy-state/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the Harness home base from the Author group", async () => {
    stubEmptyServer();
    renderApp();

    await userEvent.click(
      await screen.findByRole("button", { name: "Harness" }),
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: /harness/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /deploy-state/i }),
    ).not.toBeInTheDocument();
  });

  it("opens Settings on the Harness location page from the Harness menu", async () => {
    stubConfiguredServer();
    renderApp();

    await userEvent.click(
      await screen.findByRole("button", { name: /harness menu/i }),
    );
    const menu = await screen.findByRole("menu");
    // Settings replaced it (#995): two entries to one page would be one too many.
    expect(
      within(menu).queryByRole("menuitem", { name: "Harness location" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Settings" }),
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Harness location",
      }),
    ).toBeInTheDocument();
    const settings = screen.getByRole("complementary", { name: "Settings" });
    expect(
      within(settings).getByRole("button", { name: "Harness location" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.queryByRole("complementary", { name: "Navigation" }),
    ).not.toBeInTheDocument();
  });

  it("holds Settings in the narrow bar's menu too", async () => {
    stubConfiguredServer();
    renderApp();

    await userEvent.click(await screen.findByRole("button", { name: "Menu" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).queryByRole("menuitem", { name: "Harness location" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Settings" }),
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Harness location",
      }),
    ).toBeInTheDocument();
  });

  it("opens Appearance from the Settings sidebar and returns with Back to app", async () => {
    stubConfiguredServer();
    renderApp("/settings/harness-location");
    const settings = await screen.findByRole("complementary", {
      name: "Settings",
    });

    await userEvent.click(
      within(settings).getByRole("button", { name: "Appearance" }),
    );
    expect(
      await screen.findByRole("heading", { level: 1, name: "Appearance" }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(settings).getByRole("button", { name: "Back to app" }),
    );
    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
  });

  it("reaches the Settings pages and Back to app from the narrow bar", async () => {
    stubConfiguredServer();
    renderApp("/settings/appearance");
    const bar = await screen.findByRole("banner");

    await userEvent.click(within(bar).getByRole("button", { name: "Menu" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Harness location" }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Harness location",
      }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(bar).getByRole("button", { name: "Back to app" }),
    );
    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
  });

  it("sends the old Harness location address to the landing route", async () => {
    stubConfiguredServer();
    renderApp("/source");

    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
  });

  it("opens the Repositories screen from the sidebar", async () => {
    stubConfiguredServer();
    renderApp();

    await userEvent.click(
      await screen.findByRole("button", { name: "Repositories" }),
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Repositories" }),
    ).toBeInTheDocument();
  });
});
