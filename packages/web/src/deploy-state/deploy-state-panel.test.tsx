import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("moves focus to the card header once a removed row is gone", async () => {
    // One stub for the panel's two reads plus the removal: the row exists,
    // nothing is behind, and apm confirms the removal.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state")) {
          return jsonResponse(
            {
              primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
              skipped: [],
            },
            200,
          );
        }
        if (url.startsWith("/api/drift")) {
          return jsonResponse({ behind: [] }, 200);
        }
        return jsonResponse({ removed: { type: "skill", name: "tdd" } }, 200);
      }),
    );
    renderPanel("/Users/me/project");

    await userEvent.click(
      await screen.findByRole("button", { name: "Actions for tdd" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "remove…" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^remove tdd/ }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // The trigger the modal would restore focus to went with the row, so the
    // card's own header takes it — focus never falls to the page body.
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /project/ })).toHaveFocus();
    });
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
