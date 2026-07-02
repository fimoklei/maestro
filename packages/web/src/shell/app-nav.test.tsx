import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
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

function stubEmptyServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      jsonResponse(
        { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
        200,
      ),
    ),
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
});
