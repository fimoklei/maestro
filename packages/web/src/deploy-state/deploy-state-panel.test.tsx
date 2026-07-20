import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployStatePanel } from "./deploy-state-panel";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderPanel(repo: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DeployStatePanel repo={repo} />
    </QueryClientProvider>,
  );
}

describe("DeployStatePanel", () => {
  it("lists deployed skills with their human tag version", async () => {
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
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(screen.getByText("v0.5.0")).toBeInTheDocument();
  });

  it("states an empty repo in its header status, not as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ primitives: [], skipped: [] }, 200)),
    );
    renderPanel("/Users/me/project");

    expect(await screen.findByText("● empty")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the skipped warning, not an empty state, when only unsupported entries are deployed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            primitives: [],
            skipped: [
              { virtualPath: "hooks/format", packageType: "claude_hook" },
            ],
          },
          200,
        ),
      ),
    );
    renderPanel("/Users/me/project");

    expect(await screen.findByText(/hooks\/format/)).toBeInTheDocument();
    // Something IS deployed (just unsupported) — the cockpit must not say it is
    // empty, the lie J02 exists to prevent.
    expect(screen.queryByText("● empty")).not.toBeInTheDocument();
  });

  it("surfaces a visible error when the lockfile cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: "malformed", message: "irrelevant" }, 422),
      ),
    );
    renderPanel("/Users/me/project");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not read/i,
    );
  });

  it("warns about an entry it skipped instead of dropping it silently", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
            skipped: [
              { virtualPath: "hooks/format", packageType: "claude_hook" },
            ],
          },
          200,
        ),
      ),
    );
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(screen.getByText(/hooks\/format/)).toBeInTheDocument();
  });
});
