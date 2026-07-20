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

// A stateful server: the inventory config starts unconfigured and "connects"
// once /api/inventory/connect is POSTed, so the cockpit's own queries observe
// the same state transition a real server would cause (see frontend.md: this
// is server-state, not a hand-rolled fixture).
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

describe("connect gate", () => {
  it("walks a fresh install from welcome through connect and the success beat onto Inventory", async () => {
    stubServer();
    renderApp("/");

    // gate -> welcome
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /central inventory not connected/i,
      }),
    ).toBeInTheDocument();

    // welcome -> connect
    await userEvent.click(
      screen.getByRole("button", { name: /connect inventory/i }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /connect central inventory/i,
      }),
    ).toBeInTheDocument();

    // connect -> success beat
    await userEvent.type(
      screen.getByLabelText(/inventory path/i),
      "/home/me/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );
    expect(await screen.findByText(/3 primitives found/i)).toBeInTheDocument();
    expect(
      screen.getByText(/read-only, never writes back/i),
    ).toBeInTheDocument();

    // The beat holds until the continue action is taken — it does not
    // auto-navigate the instant the mutation resolves (ADR-0015).
    expect(
      screen.queryByRole("heading", { name: /^central inventory$/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(
      await screen.findByRole("heading", { name: /^central inventory$/i }),
    ).toBeInTheDocument();
  });

  it("advertises no register-repos step and no progress strip", async () => {
    stubServer();
    renderApp("/welcome");

    await screen.findByRole("heading", { level: 1 });

    expect(screen.queryByText(/register repos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/step 1 of 3/i)).not.toBeInTheDocument();
    // The retired strip numbered its steps ("1 · connect inventory",
    // "2 · register repos", "3 · deploy"); nothing numbers a step now.
    expect(screen.queryByText(/\d\s·\s/)).not.toBeInTheDocument();
  });

  it.each([
    "/welcome/repos",
    "/nonsense",
  ])("sends %s somewhere real rather than rendering nothing", async (route) => {
    // /welcome/repos was the retired register step's URL, so a stale
    // bookmark or a resumed session can still ask for it. With no route
    // matching and no catch-all, the user would get a blank page.
    stubServer();
    renderApp(route);

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /central inventory not connected/i,
      }),
    ).toBeInTheDocument();
  });

  it.each([
    "/welcome",
    "/welcome/connect",
  ])("redirects a configured install away from %s into the cockpit", async (route) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("/api/inventory/config")
          ? jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200)
          : jsonResponse(
              {
                ok: true,
                repos: [],
                primitives: [],
                skipped: [],
                behind: [],
              },
              200,
            ),
      ),
    );
    renderApp(route);

    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
    // No gate screen rendered on the way there: the gate's <h1> is the
    // marker, and the cockpit's own section headings are <h2>.
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("lands on Inventory even when the config refetch after connect is still in flight", async () => {
    // Reproduces a race (Codex review finding): invalidateQueries only marks
    // the config query stale and schedules a refetch — it does not update the
    // cache synchronously. If the user continues before that refetch resolves,
    // the gate's useFirstRun would still read the pre-connect cached
    // "unconfigured" answer and bounce back to /welcome. The connect
    // mutation's own response already carries the new inventoryPath, so the
    // fix is to seed the cache from it directly — this test holds the config
    // refetch open indefinitely to prove landing does not depend on it.
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
      await screen.findByRole("heading", { name: /^central inventory$/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
});
