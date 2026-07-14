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

// Routes the list's queries by URL: the registry, plus a drift and a
// deploy-state outcome for the global target and for the one registered repo.
// The roll-up joins drift against deploy-state, so a repo only reads as "needs
// update" when a behind name is actually deployed there.
function stubFetch(repoDeployState: unknown, repoDrift: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes("/api/registry/repos")) {
        return jsonResponse({ repos: [{ path: "/Users/me/app" }] }, 200);
      }
      if (target.includes("/api/deploy-state/global")) {
        return jsonResponse(
          {
            primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
            skipped: [],
          },
          200,
        );
      }
      if (target.includes("/api/deploy-state")) {
        return jsonResponse(repoDeployState, 200);
      }
      if (target.includes("/api/drift/global")) {
        return jsonResponse({ behind: [] }, 200);
      }
      return jsonResponse(repoDrift, 200);
    }),
  );
}

const tddDeployed = {
  primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
  skipped: [],
};

describe("TargetsList", () => {
  it("lists the global target and every registered repo with a status", async () => {
    // The repo deploys tdd and the check reports tdd behind -> needs update.
    stubFetch(tddDeployed, {
      behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }],
    });
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

  it("reads a target with nothing deployed as empty, not unknown", async () => {
    // A freshly-added repo has nothing deployed and its drift check cannot run
    // (it reports failure). The row must read "empty" — nothing is deployed to
    // drift — rather than the "unknown" that reads as something went wrong.
    stubFetch({ primitives: [], skipped: [] }, { ok: false });
    renderTargets();

    await screen.findByText("/Users/me/app");
    expect(
      await within(rowFor("/Users/me/app")).findByText(/empty/i),
    ).toBeInTheDocument();
    expect(
      within(rowFor("/Users/me/app")).queryByText(/unknown/i),
    ).not.toBeInTheDocument();
  });

  it("does not read a target with only skipped, unsupported primitives as empty", async () => {
    // Zero supported primitives but a non-empty skipped set: the target does hold
    // deployed content, so it must not read "empty" (the deploy-state panel shows
    // the skipped warning and never calls it empty). With a clean check it is in
    // sync.
    stubFetch(
      {
        primitives: [],
        skipped: [{ virtualPath: "hooks/pre-commit", packageType: "hook" }],
      },
      { behind: [] },
    );
    renderTargets();

    await screen.findByText("/Users/me/app");
    expect(
      await within(rowFor("/Users/me/app")).findByText(/in sync/i),
    ).toBeInTheDocument();
    expect(
      within(rowFor("/Users/me/app")).queryByText(/empty/i),
    ).not.toBeInTheDocument();
  });

  it("does not mark a repo as needing update for a behind primitive it has not deployed", async () => {
    // The repo deploys tdd, but the check reports a different (orphan) name
    // behind -> nothing deployed here can be updated, so it stays in sync.
    stubFetch(tddDeployed, {
      behind: [{ name: "foo", current: "v1.0.0", latest: "v1.1.0" }],
    });
    renderTargets();

    // Wait for the repo row to render (its registry query resolves first).
    await screen.findByText("/Users/me/app");
    expect(
      await within(rowFor("/Users/me/app")).findByText(/in sync/i),
    ).toBeInTheDocument();
    expect(
      within(rowFor("/Users/me/app")).queryByText(/needs update/i),
    ).not.toBeInTheDocument();
  });
});
