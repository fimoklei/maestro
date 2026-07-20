import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
  primitives?: unknown[];
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
      if (url.startsWith("/api/inventory/primitives")) {
        return jsonResponse({ primitives: opts.primitives ?? [] }, 200);
      }
      return jsonResponse({}, 200);
    }),
  );
}

function renderStatusBar(initialPath = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <StatusBar />
      </MemoryRouter>
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
    // "Connected" — this is where the old conflation showed as a live bug. The
    // first-run header spells this out with an empty-context wordmark and a
    // "setup required" chip; the redundant "not configured" note is dropped so
    // onboarding reads cleanly.
    stubServer({ health: "ok", config: { inventoryPath: null } });
    renderStatusBar();

    expect(await screen.findByText("setup required")).toBeInTheDocument();
    expect(screen.getByText("no inventory connected")).toBeInTheDocument();
    expect(screen.queryByText("not configured")).not.toBeInTheDocument();
    expect(screen.queryByText("connected")).not.toBeInTheDocument();
  });

  it("reads as Connected when the server is healthy and an inventory is configured", async () => {
    stubServer({
      health: "ok",
      config: { inventoryPath: "/home/me/agent-harness" },
    });
    renderStatusBar();

    expect(await screen.findByText("connected")).toBeInTheDocument();
  });

  it("shows the connected source name and live count as header context", async () => {
    // Issue #109: the source moved from the sidebar into the header. Per the
    // Control Room design it is plain context text beside the wordmark — the
    // connected source name and its live primitive count — not a button.
    stubServer({
      health: "ok",
      config: { inventoryPath: "/home/me/agent-harness" },
      primitives: [{}, {}, {}],
    });
    renderStatusBar();

    // The count lands a tick after connect (the primitive read is gated on being
    // connected), so wait for the resolved label rather than the initial
    // "reading…".
    await screen.findByText(/3 primitives/i);
    expect(screen.getByRole("banner")).toHaveTextContent(
      /agent-harness · 3 primitives/i,
    );
  });

  it("opens the source view from the header gear when connected", async () => {
    // The gear is the entry point to the /source view (status · re-read · change
    // source). It is a real button labelled for its destination, present only
    // once there is a source to manage.
    stubServer({
      health: "ok",
      config: { inventoryPath: "/home/me/agent-harness" },
      primitives: [{}],
    });
    renderStatusBar();

    const gear = await screen.findByRole("button", {
      name: /inventory source/i,
    });
    expect(gear).toBeInTheDocument();
    // Not the active view yet — the header was rendered at the landing route.
    expect(gear).not.toHaveAttribute("aria-current", "page");
  });

  it("marks the gear as the active view while on the source route", async () => {
    // On /source the gear reads as the current page so the header reflects where
    // the user is (the design highlights it amber via settingsActive).
    stubServer({
      health: "ok",
      config: { inventoryPath: "/home/me/agent-harness" },
      primitives: [{}],
    });
    renderStatusBar("/source");

    const gear = await screen.findByRole("button", {
      name: /inventory source/i,
    });
    expect(gear).toHaveAttribute("aria-current", "page");
  });

  it("omits the source gear when setup is still required", async () => {
    // No inventory yet means no source to point at — the header shows only the
    // setup-required status, never a bare gear that would dead-end on the connect gate.
    stubServer({ health: "ok", config: { inventoryPath: null } });
    renderStatusBar();

    expect(await screen.findByText("setup required")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /inventory source/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the full source name in the title so truncation stays reversible", async () => {
    // A basename is user-controlled and can be long; the header truncates it
    // visually (so it never pushes the connection state off-screen) but must
    // preserve the whole name on hover via title. The full path still lives on
    // the source view.
    const longName = "a".repeat(120);
    stubServer({
      health: "ok",
      config: { inventoryPath: `/home/me/${longName}` },
      primitives: [{}],
    });
    renderStatusBar();

    const nameEl = await screen.findByText(longName);
    expect(nameEl).toHaveAttribute("title", longName);
  });

  it("does not read the inventory until a source is configured", async () => {
    // First-run: with no configured path, /api/inventory/primitives 409s and
    // the production client would retry it repeatedly behind the connect gate. The
    // header must gate that read on a connected config, not fire it blind.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/health")) return jsonResponse({ ok: true }, 200);
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse({ inventoryPath: null }, 200);
      }
      return jsonResponse({}, 200);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <StatusBar />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("setup required")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((c) =>
        String(c[0]).startsWith("/api/inventory/primitives"),
      ),
    ).toBe(false);
  });
});
