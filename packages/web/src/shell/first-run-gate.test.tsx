import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// The config endpoint fails its first call, then recovers. Every other shell
// query resolves to an empty-but-valid body throughout. Drives the "readable
// error + retry" path: the gate can't wait for a success that never comes.
function stubServerConfigFailsOnce({
  notConfigured,
}: {
  notConfigured: boolean;
}) {
  let configCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/api/inventory/config")) {
        configCalls += 1;
        return configCalls === 1
          ? jsonResponse({ message: "unreachable" }, 500)
          : jsonResponse(
              {
                inventoryPath: notConfigured ? null : "/home/me/agent-harness",
              },
              200,
            );
      }
      return jsonResponse(
        { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
        200,
      );
    }),
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
  it("routes the landing to the connect gate when no inventory is configured", async () => {
    stubServer({ notConfigured: true });
    renderAt("/");

    expect(
      await screen.findByRole("heading", {
        name: /central inventory not connected/i,
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

  it("keeps the Inventory source view reachable when configured", async () => {
    stubServer({ notConfigured: false });
    renderAt("/source");

    expect(
      await screen.findByRole("heading", { name: /inventory source/i }),
    ).toBeInTheDocument();
  });

  it("routes an unconfigured user off the source view into the connect gate", async () => {
    // The source view is connected-only ("connected · N primitives"), so an
    // unconfigured visitor belongs in the connect gate, not on an empty source view.
    stubServer({ notConfigured: true });
    renderAt("/source");

    expect(
      await screen.findByRole("heading", {
        name: /central inventory not connected/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /inventory source/i }),
    ).not.toBeInTheDocument();
  });

  it("never shows the connect gate to a configured user, even navigating there directly", async () => {
    stubServer({ notConfigured: false });
    renderAt("/welcome");

    // Checked synchronously, before the config fetch resolves: the gate must
    // not render Welcome for even the brief pending window (Codex review
    // finding — mirrors the same fix already applied to /welcome/connect in
    // connect-view.tsx).
    expect(
      screen.queryByRole("heading", {
        name: /central inventory not connected/i,
      }),
    ).not.toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { name: /deploy-state/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: /central inventory not connected/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows a readable error with retry on /welcome when the config fetch fails, instead of hanging on Loading", async () => {
    stubServerConfigFailsOnce({ notConfigured: true });
    renderAt("/welcome");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not (be )?reach.*maestro/i);
    // The dead-end this replaces: it must not sit on the neutral "Loading…".
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("resumes the gate's welcome behavior once a retried config fetch succeeds", async () => {
    stubServerConfigFailsOnce({ notConfigured: true });
    renderAt("/welcome");

    await userEvent.click(
      await screen.findByRole("button", { name: /try again/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /central inventory not connected/i,
      }),
    ).toBeInTheDocument();
  });
});
