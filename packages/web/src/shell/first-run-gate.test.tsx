import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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

// The config endpoint drives the gate: it answers 200 with inventoryPath null
// when nothing is connected (no retry delay, unlike an error signal). Every other
// shell query resolves to an empty-but-valid body.
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

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("first-run gate", () => {
  it("routes the landing to the first-run wizard when no inventory is configured", async () => {
    stubServer({ notConfigured: true });
    renderAt("/");

    expect(
      await screen.findByRole("heading", {
        name: /connect your central inventory/i,
      }),
    ).toBeInTheDocument();
  });

  it("lands on Deploy-state when an inventory is configured", async () => {
    stubServer({ notConfigured: false });
    renderAt("/");

    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /connect inventory/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the connect screen reachable as settings when configured", async () => {
    stubServer({ notConfigured: false });
    renderAt("/connect");

    expect(
      await screen.findByRole("heading", { name: /connect inventory/i }),
    ).toBeInTheDocument();
  });

  it("never shows the wizard to a configured user, even navigating there directly", async () => {
    stubServer({ notConfigured: false });
    renderAt("/welcome");

    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: /connect your central inventory/i,
      }),
    ).not.toBeInTheDocument();
  });
});
