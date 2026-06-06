import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Stub both endpoints App's tree touches: /api/health (the shell) and the
// registry GET (RegistryPanel). The health response is parameterised per test.
function stubHealth(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("/api/health")
        ? jsonResponse(body, status)
        : jsonResponse({ repos: [] }, 200),
    ),
  );
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App health status", () => {
  it("reports healthy when /api/health is ok", async () => {
    stubHealth(200, { ok: true });
    renderApp();

    expect(await screen.findByText(/server: healthy/i)).toBeInTheDocument();
  });

  it("reports unreachable when /api/health fails", async () => {
    stubHealth(500, { ok: false });
    renderApp();

    expect(await screen.findByText(/server: unreachable/i)).toBeInTheDocument();
  });
});
