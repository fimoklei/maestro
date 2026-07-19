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

function renderSidebar(path = "/welcome") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
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
    for (const name of ["Deploy-state", "Inventory"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    // Inventory source lives in the header now (issue #109), not the sidebar.
    expect(
      screen.queryByRole("button", { name: "Inventory source" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "+ repo" }),
    ).not.toBeInTheDocument();
  });

  it("renders the interactive nav and register affordance when configured", async () => {
    stubServer({ notConfigured: false });
    renderSidebar("/");

    expect(
      await screen.findByRole("button", { name: "+ repo" }),
    ).toBeInTheDocument();
    for (const name of ["Deploy-state", "Inventory"]) {
      expect(screen.getByRole("button", { name })).toBeEnabled();
    }
    expect(
      screen.queryByRole("button", { name: "Inventory source" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/none yet/i)).not.toBeInTheDocument();
  });

  it("hides the register affordance on a wizard route even when configured", async () => {
    // The wizard's register step teaches this very action as its main card;
    // a second affordance for it on the same screen competes with the step
    // (issue #97).
    stubServer({ notConfigured: false });
    renderSidebar("/welcome/repos");

    expect(
      await screen.findByRole("button", { name: "Deploy-state" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "+ repo" }),
    ).not.toBeInTheDocument();
  });
});
