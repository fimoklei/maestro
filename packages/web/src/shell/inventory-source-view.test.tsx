import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventorySourceView } from "./inventory-source-view";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Routes the fetch stub by URL. The source view reads the current config (the
// connected path), the inventory primitives (the live N shown as "N
// primitives"), and posts to connect when the user re-points via "change
// source". primitives can be a factory so a re-read observes a changed count.
function stubApi({
  configPath = "/home/me/agent-harness",
  primitives = () => [] as unknown[],
  connect,
  browse,
}: {
  configPath?: string | null;
  primitives?: () => unknown[];
  connect?: () => Response;
  browse?: () => Response;
} = {}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse({ inventoryPath: configPath }, 200);
      }
      if (url.startsWith("/api/inventory/primitives")) {
        return jsonResponse({ primitives: primitives() }, 200);
      }
      if (url.startsWith("/api/filesystem/children")) {
        return browse
          ? browse()
          : jsonResponse(
              {
                path: "/home/me",
                breadcrumbs: [{ name: "~", path: "/home/me" }],
                entries: [],
              },
              200,
            );
      }
      return connect
        ? connect()
        : jsonResponse({ inventoryPath: "/x", primitiveCount: 0 }, 200);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/source"]}>
        <InventorySourceView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function skill(name: string) {
  return { type: "skill", name, description: `${name} skill` };
}

describe("InventorySourceView", () => {
  it("shows the connected source path and its live primitive count", async () => {
    stubApi({
      configPath: "/home/me/agent-harness",
      primitives: () => [skill("tdd"), skill("frontend"), skill("review")],
    });
    renderView();

    expect(
      await screen.findByText(/connected · 3 primitives/i),
    ).toBeInTheDocument();
    expect(screen.getByText("/home/me/agent-harness")).toBeInTheDocument();
  });

  it("re-reads the inventory on demand, refreshing the count", async () => {
    let reads = 0;
    stubApi({
      // First read returns 2 primitives, a re-read returns 5 — proves the
      // button actually refetches rather than showing a cached count.
      primitives: () => {
        reads += 1;
        return reads === 1
          ? [skill("tdd"), skill("frontend")]
          : [
              skill("tdd"),
              skill("frontend"),
              skill("review"),
              skill("deploy"),
              skill("drift"),
            ];
      },
    });
    renderView();

    expect(
      await screen.findByText(/connected · 2 primitives/i),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /re-read/i }));

    expect(
      await screen.findByText(/connected · 5 primitives/i),
    ).toBeInTheDocument();
  });

  it("shows no fake sync timestamp and singularises a lone primitive", async () => {
    stubApi({ primitives: () => [skill("tdd")] });
    renderView();

    expect(
      await screen.findByText(/connected · 1 primitive\b/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/synced/i)).not.toBeInTheDocument();
  });

  it("shows 'reading…' rather than 'undefined' while the count is still loading", async () => {
    // Config resolves but the primitives read never lands this render, so the
    // count is not yet known — the badge must not leak a bare "undefined".
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200);
        }
        if (url.startsWith("/api/inventory/primitives")) {
          return new Promise<Response>(() => {});
        }
        return jsonResponse(
          {
            path: "/home/me",
            breadcrumbs: [{ name: "~", path: "/home/me" }],
            entries: [],
          },
          200,
        );
      }),
    );
    renderView();

    expect(await screen.findByText(/connected · reading/i)).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("surfaces an inventory read failure instead of an endless 'reading…'", async () => {
    // A configured path whose inventory read fails (moved/unreadable on disk)
    // must not masquerade as a pending read forever — show a failure with the
    // re-read button as the retry.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200);
        }
        if (url.startsWith("/api/inventory/primitives")) {
          return jsonResponse({ message: "cannot read inventory" }, 500);
        }
        return jsonResponse(
          {
            path: "/home/me",
            breadcrumbs: [{ name: "~", path: "/home/me" }],
            entries: [],
          },
          200,
        );
      }),
    );
    renderView();

    expect(
      await screen.findByText(/could not read the inventory/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/reading…/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/connected ·/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /re-read/i }),
    ).toBeInTheDocument();
  });

  it("surfaces a failed re-read even after a count was already shown", async () => {
    // The stale-cache trap: TanStack Query keeps the last good data on a failed
    // refetch. After showing a count, a re-read that fails must flip to the
    // failure state, not keep the now-stale "connected · N".
    let ok = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200);
        }
        if (url.startsWith("/api/inventory/primitives")) {
          return ok
            ? jsonResponse(
                { primitives: [skill("tdd"), skill("frontend")] },
                200,
              )
            : jsonResponse({ message: "cannot read inventory" }, 500);
        }
        return jsonResponse(
          {
            path: "/home/me",
            breadcrumbs: [{ name: "~", path: "/home/me" }],
            entries: [],
          },
          200,
        );
      }),
    );
    renderView();

    expect(
      await screen.findByText(/connected · 2 primitives/i),
    ).toBeInTheDocument();

    ok = false;
    await userEvent.click(screen.getByRole("button", { name: /re-read/i }));

    expect(
      await screen.findByText(/could not read the inventory/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/connected · 2 primitives/i),
    ).not.toBeInTheDocument();
  });

  it("leads the healthy state with ● and the read-error with ▲ so shape, not just colour, tells them apart", async () => {
    // Never-Colour-Alone: the healthy and fault badges shared ● (issue #229),
    // so a user who can't separate green from amber saw one shape for both.
    // The codebase already owns ▲ for warnings; the fault badge takes it.
    stubApi({ primitives: () => [skill("tdd")] });
    const { unmount } = renderView();
    expect(
      await screen.findByText(/^● connected · 1 primitive/i),
    ).toBeInTheDocument();
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200);
        }
        if (url.startsWith("/api/inventory/primitives")) {
          return jsonResponse({ message: "cannot read inventory" }, 500);
        }
        return jsonResponse(
          {
            path: "/home/me",
            breadcrumbs: [{ name: "~", path: "/home/me" }],
            entries: [],
          },
          200,
        );
      }),
    );
    renderView();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/^▲ could not read the inventory/i);
    expect(alert).toHaveClass(
      "border-amber-border",
      "bg-amber-bg",
      "text-amber-ink",
    );
  });

  it("re-points via the shared form and returns to the connected view", async () => {
    let configPath = "/home/me/agent-harness";
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath: configPath }, 200);
        }
        if (url.startsWith("/api/inventory/primitives")) {
          return jsonResponse({ primitives: [skill("tdd")] }, 200);
        }
        if (url.startsWith("/api/filesystem/children")) {
          return jsonResponse(
            {
              path: "/home/me",
              breadcrumbs: [{ name: "~", path: "/home/me" }],
              entries: [],
            },
            200,
          );
        }
        const body = JSON.parse(String(init?.body)) as { path: string };
        configPath = body.path;
        return jsonResponse(
          { inventoryPath: body.path, primitiveCount: 1 },
          200,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    renderView();

    expect(
      await screen.findByText("/home/me/agent-harness"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /change source/i }),
    );

    const field = await screen.findByLabelText(/inventory path/i);
    await userEvent.clear(field);
    await userEvent.type(field, "/home/me/other-harness");
    await userEvent.click(
      screen.getByRole("button", { name: /re-point source/i }),
    );

    expect(
      await screen.findByText("/home/me/other-harness"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/inventory path/i)).not.toBeInTheDocument();

    const connectCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).startsWith("/api/inventory/connect"),
    );
    expect(connectCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(connectCall?.[1]?.body as string)).toEqual({
      path: "/home/me/other-harness",
    });
  });

  it("cancels a change and stays on the connected view", async () => {
    stubApi({ primitives: () => [skill("tdd")] });
    renderView();

    await userEvent.click(
      await screen.findByRole("button", { name: /change source/i }),
    );
    expect(await screen.findByLabelText(/inventory path/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(
      await screen.findByText(/connected · 1 primitive\b/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/inventory path/i)).not.toBeInTheDocument();
  });
});
