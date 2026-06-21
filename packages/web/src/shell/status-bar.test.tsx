import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StatusBar } from "./status-bar";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderStatusBar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StatusBar />
    </QueryClientProvider>,
  );
}

describe("StatusBar", () => {
  it("reads as connected when the server is healthy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true }, 200)),
    );
    renderStatusBar();

    expect(await screen.findByText(/connected/i)).toBeInTheDocument();
  });

  it("reads as disconnected when the server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "boom" }, 500)),
    );
    renderStatusBar();

    expect(await screen.findByText(/disconnected/i)).toBeInTheDocument();
  });
});
