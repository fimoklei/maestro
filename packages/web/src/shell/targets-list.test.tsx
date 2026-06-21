import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TargetsList } from "./targets-list";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderTargets() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TargetsList />
    </QueryClientProvider>,
  );
}

function rowFor(label: string) {
  const node = screen.getByText(label).closest("li");
  if (!node) {
    throw new Error(`no target row for ${label}`);
  }
  return node;
}

describe("TargetsList", () => {
  it("lists the global target and every registered repo with a status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const target = String(url);
        if (target.includes("/api/registry/repos")) {
          return jsonResponse({ repos: [{ path: "/Users/me/app" }] }, 200);
        }
        if (target.includes("/api/drift/global")) {
          return jsonResponse({ behind: [] }, 200);
        }
        // per-repo drift: behind -> the repo target reads as needing an update.
        return jsonResponse(
          { behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }] },
          200,
        );
      }),
    );
    renderTargets();

    // Global is in sync (drift check ran, nothing behind).
    expect(
      await within(rowFor("Global")).findByText(/in sync/i),
    ).toBeInTheDocument();

    // The registered repo is behind, so its target reads as needing an update.
    expect(
      await within(rowFor("/Users/me/app")).findByText(/needs update/i),
    ).toBeInTheDocument();
  });
});
