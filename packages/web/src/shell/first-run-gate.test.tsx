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

// The inventory read drives the gate. notConfigured=true returns a 409 from the
// primitives endpoint (the server's "no inventory configured" signal); every
// other shell query resolves to an empty-but-valid body.
function stubServer({ notConfigured }: { notConfigured: boolean }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) =>
      String(input).startsWith("/api/inventory/primitives") && notConfigured
        ? jsonResponse({ error: "not-configured", message: "irrelevant" }, 409)
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
  it("routes the landing to the connect screen when no inventory is configured", async () => {
    stubServer({ notConfigured: true });
    renderAt("/");

    expect(
      await screen.findByRole("heading", { name: /connect inventory/i }),
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
});
