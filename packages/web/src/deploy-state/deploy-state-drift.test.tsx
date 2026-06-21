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

// Routes the panel's two queries (deploy-state and drift) by URL, so each
// scenario can pin one deployed skill and a distinct drift outcome.
function stubFetch(deployState: unknown, drift: unknown, driftStatus = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/drift")) {
        return jsonResponse(drift, driftStatus);
      }
      return jsonResponse(deployState, 200);
    }),
  );
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

const tddDeployed = {
  primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
  skipped: [],
};

describe("DeployStatePanel drift badge", () => {
  it("shows a behind badge for a skill the check reports behind", async () => {
    stubFetch(tddDeployed, {
      behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }],
    });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(await screen.findByText(/behind/i)).toBeInTheDocument();
  });

  it("shows up-to-date for a skill the check does not report behind", async () => {
    stubFetch(tddDeployed, { behind: [] });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(await screen.findByText(/up-to-date/i)).toBeInTheDocument();
  });

  it("shows unknown, never up-to-date, when the check could not run", async () => {
    stubFetch(tddDeployed, { ok: false });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(await screen.findByText(/unknown/i)).toBeInTheDocument();
    expect(screen.queryByText(/up-to-date/i)).not.toBeInTheDocument();
  });

  it("surfaces a behind name that is not a deployed skill, instead of dropping it", async () => {
    stubFetch(tddDeployed, {
      behind: [
        { name: "tdd", current: "v0.5.0", latest: "v0.5.1" },
        { name: "foo", current: "v1.0.0", latest: "v1.1.0" },
      ],
    });
    renderPanel("/Users/me/project");

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(await screen.findByText(/not deployed here/i)).toHaveTextContent(
      /foo/,
    );
  });
});
