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
// once /api/inventory/connect is POSTed, and the registry accumulates repos as
// they are registered — so the cockpit's own queries observe the same state
// transitions a real server would cause (see frontend.md: this is
// server-state, not a hand-rolled fixture).
function stubServer() {
  let inventoryPath: string | null = null;
  const registered: Array<{ path: string }> = [];
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
      if (url.startsWith("/api/filesystem/children")) {
        // An empty home folder: the register step reaches the picker for its
        // paste field, not for anything to click.
        return jsonResponse(
          {
            path: "/home/me",
            breadcrumbs: [{ name: "~", path: "/home/me" }],
            entries: [],
          },
          200,
        );
      }
      if (url.startsWith("/api/registry/repos")) {
        if (init?.method === "POST") {
          const { path } = JSON.parse(String(init.body)) as { path: string };
          registered.push({ path });
          return jsonResponse({ repos: registered }, 201);
        }
        return jsonResponse({ repos: registered }, 200);
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
  it("walks an unconfigured user from the gate through welcome, connect and register to landing", async () => {
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

    // connect -> confirmation -> register step
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
      await screen.findByRole("heading", { name: /register consuming repos/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/2 · register repos/i)).toHaveAttribute(
      "aria-current",
      "step",
    );

    // register a repo through the picker -> dismiss its report -> finish
    await userEvent.click(screen.getByRole("button", { name: /\+ repo/i }));
    await userEvent.type(
      await screen.findByRole("textbox", { name: /or paste/i }),
      "/home/me/acme-web",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /register 1 selected/i }),
    );
    await userEvent.click(await screen.findByRole("button", { name: /done/i }));
    await userEvent.click(
      await screen.findByRole("button", { name: /continue to deploy-state/i }),
    );
    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
  });

  it("lands on Deploy-state when the register step is skipped", async () => {
    stubServer();
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
      await screen.findByRole("heading", { name: /register consuming repos/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
  });

  it("reaches the register step and lands even when the config refetch after connect is still in flight", async () => {
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

    // The register step renders from the seeded config cache, without the
    // held-open refetch resolving; skipping then lands on Deploy-state.
    expect(
      await screen.findByRole("heading", { name: /register consuming repos/i }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /skip/i }));

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
