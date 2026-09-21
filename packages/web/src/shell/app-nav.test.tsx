import { screen } from "@testing-library/react";
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

// A configured server: the sidebar's Harness menu holds the Harness location
// entry, so the source view is reachable from the frame (#991) rather than a
// nav item of its own.
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

function renderApp() {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/"]}>
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

  it("opens the Harness location view from the Harness menu", async () => {
    stubConfiguredServer();
    renderApp();

    await userEvent.click(
      await screen.findByRole("button", { name: /harness menu/i }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Harness location" }),
    );

    expect(
      await screen.findByRole("heading", { name: /harness location/i }),
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
