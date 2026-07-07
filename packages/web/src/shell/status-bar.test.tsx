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

// The header now reads two signals — /api/health and /api/inventory/config — so
// the stub routes by URL. `health: "down"` fails the health probe; `config` is
// either a body (inventoryPath null = not connected, set = connected) or "error"
// to fail the config read.
function stubServer(opts: {
  health?: "ok" | "down";
  config?: { inventoryPath: string | null } | "error";
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/health")) {
        return opts.health === "down"
          ? jsonResponse({ message: "boom" }, 500)
          : jsonResponse({ ok: true }, 200);
      }
      if (url.startsWith("/api/inventory/config")) {
        return opts.config === "error"
          ? jsonResponse({ message: "boom" }, 500)
          : jsonResponse(opts.config ?? { inventoryPath: null }, 200);
      }
      return jsonResponse({}, 200);
    }),
  );
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
  it("reads as Connecting… while either query is still pending", () => {
    // A fetch that never resolves keeps both queries pending, so the header
    // must sit on the neutral in-flight state, never guess "Connected".
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderStatusBar();

    expect(screen.getByText(/connecting/i)).toBeInTheDocument();
  });

  it("reads as Disconnected when the server is unreachable", async () => {
    stubServer({ health: "down", config: { inventoryPath: null } });
    renderStatusBar();

    expect(await screen.findByText(/disconnected/i)).toBeInTheDocument();
  });

  it("reads as Disconnected when the config query cannot be read", async () => {
    // Server up but /api/inventory/config unreadable: we don't *know* whether an
    // inventory exists, so claiming "Connected" would repeat the original bug.
    stubServer({ health: "ok", config: "error" });
    renderStatusBar();

    expect(await screen.findByText(/disconnected/i)).toBeInTheDocument();
  });

  it("reads as Setup required when the server is healthy but no inventory is configured", async () => {
    // The core fix: a healthy server with inventoryPath null is first-run, not
    // "Connected" — this is where the old conflation showed as a live bug.
    stubServer({ health: "ok", config: { inventoryPath: null } });
    renderStatusBar();

    expect(await screen.findByText(/setup required/i)).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("reads as Connected when the server is healthy and an inventory is configured", async () => {
    stubServer({
      health: "ok",
      config: { inventoryPath: "/home/me/agent-harness" },
    });
    renderStatusBar();

    expect(await screen.findByText("Connected")).toBeInTheDocument();
  });
});
