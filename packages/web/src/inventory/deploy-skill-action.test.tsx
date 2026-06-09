import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployStatePanel } from "../deploy-state/deploy-state-panel";
import { DeploySkillAction } from "./deploy-skill-action";

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const repos = [{ path: "/projects/alpha" }, { path: "/projects/beta" }];

function renderAction(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("DeploySkillAction", () => {
  it("deploys the skill to the chosen repo", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderAction(<DeploySkillAction skillName="tdd" repos={repos} />);

    await userEvent.selectOptions(
      screen.getByLabelText(/deploy tdd to/i),
      "/projects/beta",
    );
    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    expect(
      await screen.findByText(/deployed tdd v0\.5\.1/i),
    ).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/deploy");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      type: "skill",
      name: "tdd",
      repoPath: "/projects/beta",
    });
  });

  it("disables the deploy button when no repo is registered", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderAction(<DeploySkillAction skillName="tdd" repos={[]} />);

    expect(screen.getByRole("button", { name: /deploy/i })).toBeDisabled();
  });

  it("refreshes the deploy-state panel after a successful deploy", async () => {
    // fetch sequence: deploy-state (empty) → deploy → deploy-state (skill at tag).
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy-state")) {
        return fetchMock.mock.calls.filter((c) =>
          String(c[0]).startsWith("/api/deploy-state"),
        ).length <= 1
          ? jsonResponse({ primitives: [], skipped: [] })
          : jsonResponse({
              primitives: [{ type: "skill", name: "tdd", version: "v0.5.1" }],
              skipped: [],
            });
      }
      return jsonResponse({
        deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAction(
      <>
        <DeploySkillAction
          skillName="tdd"
          repos={[{ path: "/projects/alpha" }]}
        />
        <DeployStatePanel repo="/projects/alpha" />
      </>,
    );

    expect(
      await screen.findByText(/nothing deployed here/i),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    // The panel updates without a reload: the deploy invalidated its query.
    expect(await screen.findByText("v0.5.1")).toBeInTheDocument();
  });
});
