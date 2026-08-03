import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "./app-router";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// The harness read has its own shape, so it answers separately: the catch-all
// body would reach the Harness view without the fields it renders.
const HARNESS_STATE = {
  origin: "github.com/fimoklei/agent-harness",
  releasedVersion: "v0.5.0",
  defaultBranch: "main",
  releaseState: "released",
  freshness: { outcome: null, lastFetchedAt: null },
  movements: [],
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

// A configured server: the header exposes the inventory-source entry, so the
// source view is reachable from the header (issue #109) rather than a sidebar
// nav item.
function stubConfiguredServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200);
      }
      return jsonResponse(
        { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
        200,
      );
    }),
  );
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
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
      await screen.findByRole("heading", { name: /central inventory/i }),
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
      await screen.findByRole("heading", { level: 2, name: /harness/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /deploy-state/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the Inventory source view from the header entry point", async () => {
    stubConfiguredServer();
    renderApp();

    await userEvent.click(
      await screen.findByRole("button", { name: /inventory source/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /inventory source/i }),
    ).toBeInTheDocument();
  });
});
