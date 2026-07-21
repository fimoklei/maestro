import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
  it("holds the card frame with a skeleton while the source config loads", async () => {
    // Config never resolves this render, so the view stays in its loading
    // state. The frame — the heading and the card — must already be on screen
    // so nothing jumps when the data lands, and the skeleton must announce
    // itself to assistive tech rather than showing a bare "Loading…" (#231).
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return new Promise<Response>(() => {});
        }
        return jsonResponse({ primitives: [] }, 200);
      }),
    );
    renderView();

    expect(
      await screen.findByRole("status", { name: /loading source/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /inventory source/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Loading…$/)).not.toBeInTheDocument();
  });

  it("shows the connected source path and its live primitive count", async () => {
    stubApi({
      configPath: "/home/me/agent-harness",
      primitives: () => [skill("tdd"), skill("frontend"), skill("review")],
    });
    renderView();

    expect(await screen.findByText(/3 primitives/i)).toBeInTheDocument();
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

    expect(await screen.findByText(/2 primitives/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /re-read/i }));

    expect(await screen.findByText(/5 primitives/i)).toBeInTheDocument();
  });

  it("labels the Re-read button 'reading…' while fetching, then 'Re-read' when idle", async () => {
    // A controllable primitives read: it stays pending until we resolve it, so
    // we can observe the button mid-fetch (label "reading…", disabled) and after
    // it settles (label back to "Re-read"). This is the most-repeated action's
    // in-progress feedback (issue #230).
    let resolvePrimitives: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200);
        }
        if (url.startsWith("/api/inventory/primitives")) {
          return new Promise<Response>((resolve) => {
            resolvePrimitives = resolve;
          });
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

    const reading = await screen.findByRole("button", { name: /reading…/i });
    expect(reading).toBeDisabled();

    resolvePrimitives(jsonResponse({ primitives: [skill("tdd")] }, 200));

    const reread = await screen.findByRole("button", { name: /^re-read$/i });
    expect(reread).toBeEnabled();
  });

  it("announces a re-read even when the count is unchanged", async () => {
    // A live region only announces when its text mutates, and TanStack Query
    // keeps the previous count during a refetch. So a re-read returning the same
    // N — the common case — must still confirm to a screen reader: the status
    // passes through "reading…", making the settle back to the count a genuine
    // mutation the reader hears (issue #230).
    let resolveSecond: (r: Response) => void = () => {};
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200);
        }
        if (url.startsWith("/api/inventory/primitives")) {
          reads += 1;
          if (reads === 1) {
            return jsonResponse(
              { primitives: [skill("tdd"), skill("frontend")] },
              200,
            );
          }
          return new Promise<Response>((resolve) => {
            resolveSecond = resolve;
          });
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

    // Wait for the settled count before grabbing the status: the loading
    // skeleton is also a role="status", so an early findByRole would capture
    // that node just before it unmounts (#231).
    await screen.findByText(/2 primitives/i);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/2 primitives/i);

    await userEvent.click(screen.getByRole("button", { name: /re-read/i }));
    await waitFor(() => expect(status).toHaveTextContent(/reading…/i));

    resolveSecond(
      jsonResponse({ primitives: [skill("tdd"), skill("frontend")] }, 200),
    );
    await waitFor(() => expect(status).toHaveTextContent(/2 primitives/i));
  });

  it("announces the connected count as a live status region", async () => {
    // The refreshed count needs an accessible confirmation: a screen reader must
    // hear "● N primitives" when a re-read lands (issue #230).
    stubApi({
      configPath: "/home/me/agent-harness",
      primitives: () => [skill("tdd"), skill("frontend")],
    });
    renderView();

    // Wait for the settled count first: the loading skeleton is also a
    // role="status", so grabbing the role too early captures that node (#231).
    await screen.findByText(/2 primitives/i);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/2 primitives/i);
  });

  it("shows no fake sync timestamp and singularises a lone primitive", async () => {
    stubApi({ primitives: () => [skill("tdd")] });
    renderView();

    expect(await screen.findByText(/1 primitive\b/i)).toBeInTheDocument();
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

    expect(await screen.findByText(/● reading/i)).toBeInTheDocument();
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
    // The count pill is a role="status"; a pure read failure cedes it to the
    // role="alert" above, so no status region is on screen.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /re-read/i }),
    ).toBeInTheDocument();
  });

  it("surfaces a failed re-read even after a count was already shown", async () => {
    // The stale-cache trap: TanStack Query keeps the last good data on a failed
    // refetch. After showing a count, a re-read that fails must flip to the
    // failure state, not keep the now-stale "● N primitives".
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

    expect(await screen.findByText(/2 primitives/i)).toBeInTheDocument();

    ok = false;
    await userEvent.click(screen.getByRole("button", { name: /re-read/i }));

    expect(
      await screen.findByText(/could not read the inventory/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/2 primitives/i)).not.toBeInTheDocument();
  });

  it("leads the healthy state with ● and the read-error with ▲ so shape, not just colour, tells them apart", async () => {
    // Never-Colour-Alone: the healthy and fault badges shared ● (issue #229),
    // so a user who can't separate green from amber saw one shape for both.
    // The codebase already owns ▲ for warnings; the fault badge takes it.
    stubApi({ primitives: () => [skill("tdd")] });
    const { unmount } = renderView();
    expect(await screen.findByText(/^● 1 primitive/i)).toBeInTheDocument();
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

  it("announces a successful retry after a failed read", async () => {
    // The failure→success path: TanStack Query holds isError true while the
    // retry runs, so the live status must stay mounted through the retry (not
    // cede to the error alert) and pass "reading…" → "● N primitives". A status
    // region freshly mounted with the count already in it announces nothing;
    // the mutation is what a screen reader hears (issue #230).
    let resolveRetry: (r: Response) => void = () => {};
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200);
        }
        if (url.startsWith("/api/inventory/primitives")) {
          reads += 1;
          if (reads === 1) {
            return jsonResponse({ message: "cannot read inventory" }, 500);
          }
          return new Promise<Response>((resolve) => {
            resolveRetry = resolve;
          });
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

    await userEvent.click(screen.getByRole("button", { name: /re-read/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/reading…/i);

    resolveRetry(
      jsonResponse({ primitives: [skill("tdd"), skill("frontend")] }, 200),
    );
    await waitFor(() => expect(status).toHaveTextContent(/2 primitives/i));
  });

  it("announces the recovery when a retry succeeds after a failed re-read of an already-shown count", async () => {
    // Has-data variant: once a count is on screen, TanStack Query keeps isError
    // true *during* the retry because it still holds the last good count. The
    // live status must not cede to the error alert while that retry runs, or the
    // recovered count mounts fresh and goes unannounced to screen readers
    // (issue #230). Distinct from the no-data path, where Query resets to
    // pending during the retry.
    let resolveRetry: (r: Response) => void = () => {};
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200);
        }
        if (url.startsWith("/api/inventory/primitives")) {
          reads += 1;
          if (reads === 1) {
            return jsonResponse(
              { primitives: [skill("tdd"), skill("frontend")] },
              200,
            );
          }
          if (reads === 2) {
            return jsonResponse({ message: "cannot read inventory" }, 500);
          }
          return new Promise<Response>((resolve) => {
            resolveRetry = resolve;
          });
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

    expect(await screen.findByText(/2 primitives/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /re-read/i }));
    expect(
      await screen.findByText(/could not read the inventory/i),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /re-read/i }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/reading…/i);

    resolveRetry(
      jsonResponse(
        {
          primitives: [
            skill("tdd"),
            skill("frontend"),
            skill("review"),
            skill("deploy"),
            skill("drift"),
          ],
        },
        200,
      ),
    );
    await waitFor(() => expect(status).toHaveTextContent(/5 primitives/i));
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

    expect(await screen.findByText(/1 primitive\b/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/inventory path/i)).not.toBeInTheDocument();
  });
});
