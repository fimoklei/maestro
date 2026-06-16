import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployStatePanel } from "../deploy-state/deploy-state-panel";
import { GlobalDeployStatePanel } from "../deploy-state/global-deploy-state-panel";
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
  it("disables the deploy button until the registry has loaded", async () => {
    // A pending or failed registry yields an empty repos list that is
    // indistinguishable from "no repos registered"; without this guard a fast
    // click would fall back to Global and deploy globally by accident (#37).
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderAction(
      <DeploySkillAction skillName="tdd" repos={[]} registryReady={false} />,
    );

    const button = screen.getByRole("button", { name: /loading targets/i });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deploys the skill to the chosen repo", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderAction(
      <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
    );

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
      target: { kind: "repo", repoPath: "/projects/beta" },
    });
  });

  it("offers Global as the first target option", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderAction(
      <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
    );

    const options = within(
      screen.getByLabelText(/deploy tdd to/i),
    ).getAllByRole("option");
    expect(options[0]).toHaveTextContent("Global");
  });

  it("deploys globally when no repo is registered", async () => {
    // Global needs no repo, so the action is usable at zero registered repos —
    // the button is never stuck disabled (J07).
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderAction(
      <DeploySkillAction skillName="tdd" repos={[]} registryReady />,
    );

    const button = screen.getByRole("button", { name: /deploy/i });
    expect(button).toBeEnabled();
    await userEvent.click(button);

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toEqual({
      type: "skill",
      name: "tdd",
      target: { kind: "global" },
    });
  });

  it("deploys globally when Global is chosen even with repos present", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderAction(
      <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
    );

    await userEvent.selectOptions(
      screen.getByLabelText(/deploy tdd to/i),
      "Global",
    );
    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string)).toEqual({
      type: "skill",
      name: "tdd",
      target: { kind: "global" },
    });
  });

  it("shows the server's error message when a deploy is refused", async () => {
    // The server crafts an actionable message per typed error (issue #15);
    // a generic "Deploy failed." would throw that guidance away.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "local-diverged-from-tag",
              message:
                "Your local skill differs from its latest published tag. Tag and push your change first.",
            }),
            {
              status: 409,
              headers: { "content-type": "application/json" },
            },
          ),
      ),
    );
    renderAction(
      <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
    );

    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /tag and push your change/i,
    );
  });

  it("disables the deploy action while a deploy is pending", async () => {
    // Never resolves: the deploy stays pending for the rest of the test.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    renderAction(
      <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
    );

    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    expect(
      await screen.findByRole("button", { name: /deploying/i }),
    ).toBeDisabled();
  });

  it("refreshes the repo deploy-state panel after a successful deploy", async () => {
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
          registryReady
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

  it("refreshes the repo drift badge after a successful deploy", async () => {
    // Drift is a separate query from deploy-state; a deploy must invalidate it
    // too, or a freshly deployed skill keeps its stale "unknown" badge (#48).
    // The skill is already deployed at a tag so a badge renders before and
    // after; drift goes unknown → behind once the refetch lands.
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/drift")) {
        return fetchMock.mock.calls.filter((c) =>
          String(c[0]).includes("/api/drift"),
        ).length <= 1
          ? jsonResponse({ ok: false })
          : jsonResponse({ behind: ["tdd"] });
      }
      if (url.startsWith("/api/deploy-state")) {
        return jsonResponse({
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
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
          registryReady
        />
        <DeployStatePanel repo="/projects/alpha" />
      </>,
    );

    expect(await screen.findByText(/unknown/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    // The drift query refetched because the deploy invalidated it.
    expect(await screen.findByText(/behind/i)).toBeInTheDocument();
  });

  it("refreshes the global deploy-state panel after a global deploy", async () => {
    // A global deploy invalidates the global query, so the Global panel
    // refetches without a reload (J07).
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy-state/global")) {
        return fetchMock.mock.calls.filter((c) =>
          String(c[0]).startsWith("/api/deploy-state/global"),
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
        <DeploySkillAction skillName="tdd" repos={[]} registryReady />
        <GlobalDeployStatePanel />
      </>,
    );

    expect(
      await screen.findByText(/nothing deployed here/i),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    expect(await screen.findByText("v0.5.1")).toBeInTheDocument();
  });

  it("refreshes the global drift badge after a global deploy", async () => {
    // Same symmetry as the repo case: a global deploy must invalidate the
    // global drift query, not only deploy-state (#48).
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/drift/global")) {
        return fetchMock.mock.calls.filter((c) =>
          String(c[0]).includes("/api/drift/global"),
        ).length <= 1
          ? jsonResponse({ ok: false })
          : jsonResponse({ behind: ["tdd"] });
      }
      if (url.startsWith("/api/deploy-state/global")) {
        return jsonResponse({
          primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
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
        <DeploySkillAction skillName="tdd" repos={[]} registryReady />
        <GlobalDeployStatePanel />
      </>,
    );

    expect(await screen.findByText(/unknown/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    expect(await screen.findByText(/behind/i)).toBeInTheDocument();
  });
});
