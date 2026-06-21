import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalDeployStatePanel } from "./global-deploy-state-panel";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GlobalDeployStatePanel />
    </QueryClientProvider>,
  );
}

describe("GlobalDeployStatePanel", () => {
  it("always shows a Global heading, even while loading", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderPanel();

    expect(
      screen.getByRole("heading", { name: /global/i }),
    ).toBeInTheDocument();
  });

  it("lists globally deployed skills with their human tag version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
            skipped: [],
          },
          200,
        ),
      ),
    );
    renderPanel();

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(screen.getByText("v0.5.0")).toBeInTheDocument();
  });

  it("shows an explicit empty state, not an error, when nothing is deployed globally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ primitives: [], skipped: [] }, 200)),
    );
    renderPanel();

    expect(await screen.findByText(/nothing deployed/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces a visible error when the global lockfile cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: "malformed", message: "irrelevant" }, 422),
      ),
    );
    renderPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not read/i,
    );
  });

  it("shows global drift badges without needing a repo path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/drift/global") {
          return jsonResponse(
            { behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }] },
            200,
          );
        }
        return jsonResponse(
          {
            primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
            skipped: [],
          },
          200,
        );
      }),
    );
    renderPanel();

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(await screen.findByText(/behind/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/drift/global", expect.anything());
  });

  it("shows unknown, never up-to-date, when global drift cannot be checked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/drift/global") {
          return jsonResponse({ ok: false }, 200);
        }
        return jsonResponse(
          {
            primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
            skipped: [],
          },
          200,
        );
      }),
    );
    renderPanel();

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(await screen.findByText(/unknown/i)).toBeInTheDocument();
    expect(screen.queryByText(/up-to-date/i)).not.toBeInTheDocument();
  });
});
