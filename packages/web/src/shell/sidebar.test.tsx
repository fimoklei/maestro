import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubServer({ notConfigured }: { notConfigured: boolean }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/inventory/config")
        ? jsonResponse(
            { inventoryPath: notConfigured ? null : "/home/me/agent-harness" },
            200,
          )
        : jsonResponse(
            { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
            200,
          ),
    ),
  );
}

function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/welcome"]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Sidebar first-run rendering", () => {
  it("dims the nav, hides register, and shows 'none yet' when unconfigured", async () => {
    stubServer({ notConfigured: true });
    renderSidebar();

    expect(await screen.findByText(/none yet/i)).toBeInTheDocument();
    for (const name of ["Deploy-state", "Inventory", "Connect"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.queryByLabelText(/repo path/i)).not.toBeInTheDocument();
  });

  it("renders the interactive nav and register affordance when configured", async () => {
    stubServer({ notConfigured: false });
    renderSidebar();

    expect(await screen.findByLabelText(/repo path/i)).toBeInTheDocument();
    for (const name of ["Deploy-state", "Inventory", "Connect"]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    expect(screen.queryByText(/none yet/i)).not.toBeInTheDocument();
  });
});
