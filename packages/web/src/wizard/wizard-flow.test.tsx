import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../shell/app-router";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// A stateful inventory config: starts unconfigured, then "connects" once
// /api/inventory/connect is POSTed — so the cockpit's own queries observe the
// same state transition a real connect would cause (see frontend.md: this is
// server-state, not a hand-rolled fixture).
function stubServer() {
  let inventoryPath: string | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse({ inventoryPath }, 200);
      }
      if (url.startsWith("/api/inventory/connect") && init?.method === "POST") {
        inventoryPath = "/home/me/agent-harness";
        return jsonResponse({ inventoryPath, primitiveCount: 3 }, 200);
      }
      return jsonResponse(
        { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
        200,
      );
    }),
  );
}

function renderApp(path: string) {
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

describe("first-run wizard sequence", () => {
  it("walks an unconfigured user from the gate through welcome and connect to landing", async () => {
    stubServer();
    renderApp("/");

    // gate -> welcome
    expect(
      await screen.findByRole("heading", {
        name: /connect your central inventory/i,
      }),
    ).toBeInTheDocument();

    // welcome -> connect
    await userEvent.click(
      screen.getByRole("button", { name: /connect inventory/i }),
    );
    expect(
      await screen.findByRole("heading", {
        name: /connect central inventory/i,
      }),
    ).toBeInTheDocument();

    // connect -> confirmation -> land
    await userEvent.type(
      screen.getByLabelText(/inventory path/i),
      "/home/me/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );
    expect(await screen.findByText(/3 primitives found/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
  });

  it("lands on Deploy-state even when the config refetch after connect is still in flight", async () => {
    // Reproduces a race (Codex review finding): invalidateQueries only marks
    // the config query stale and schedules a refetch — it does not update the
    // cache synchronously. If the user clicks Continue before that refetch
    // resolves, the gate's useFirstRun would still read the pre-connect
    // cached "unconfigured" answer and bounce back to /welcome. The connect
    // mutation's own response already carries the new inventoryPath, so the
    // fix is to seed the cache from it directly — this test holds the config
    // refetch open indefinitely to prove landing does not depend on it
    // resolving.
    let inventoryPath: string | null = null;
    let configRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          configRequests += 1;
          if (configRequests > 1) {
            return new Promise<Response>(() => {}); // never resolves
          }
          return jsonResponse({ inventoryPath }, 200);
        }
        if (
          url.startsWith("/api/inventory/connect") &&
          init?.method === "POST"
        ) {
          inventoryPath = "/home/me/agent-harness";
          return jsonResponse({ inventoryPath, primitiveCount: 3 }, 200);
        }
        return jsonResponse(
          { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
          200,
        );
      }),
    );
    renderApp("/welcome/connect");

    await userEvent.type(
      await screen.findByLabelText(/inventory path/i),
      "/home/me/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /continue/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: /connect your central inventory/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("never shows the wizard to an already-configured user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("/api/inventory/config")
          ? jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200)
          : jsonResponse(
              { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
              200,
            ),
      ),
    );
    renderApp("/");

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
