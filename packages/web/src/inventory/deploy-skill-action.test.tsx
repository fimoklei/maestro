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

  it("carries no register hint of its own, so a long list never repeats it", async () => {
    // The hint belongs to the list (InventoryList), once, above every row —
    // one per picker would print the same sentence for every skill.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ tools: [], primitives: [], skipped: [] }),
      ),
    );
    renderAction(
      <DeploySkillAction skillName="tdd" repos={[]} registryReady />,
    );

    expect(
      await screen.findByRole("button", { name: /deploy/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no repositories registered yet/i),
    ).not.toBeInTheDocument();
  });

  it("names the tools the Global option will hit on a two-tool machine", async () => {
    // #134: the single Global option tells you where it lands before you click,
    // read from the global deploy-state's detected-tool set (no stored list).
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state/global")) {
          return jsonResponse({
            tools: [
              { tool: "claude", primitives: [] },
              { tool: "codex", primitives: [] },
            ],
            skipped: [],
          });
        }
        return jsonResponse({ primitives: [], skipped: [] });
      }),
    );
    renderAction(
      <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
    );

    const globalOption = await within(
      screen.getByLabelText(/deploy tdd to/i),
    ).findByRole("option", { name: /Global \(Claude Code \+ Codex\)/ });
    expect(globalOption).toBeEnabled();
  });

  it("names the single tool the Global option will hit on a one-tool machine", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state/global")) {
          return jsonResponse({
            tools: [{ tool: "claude", primitives: [] }],
            skipped: [],
          });
        }
        return jsonResponse({ primitives: [], skipped: [] });
      }),
    );
    renderAction(
      <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
    );

    const globalOption = await within(
      screen.getByLabelText(/deploy tdd to/i),
    ).findByRole("option", { name: /Global \(Claude Code\)/ });
    expect(globalOption).toBeInTheDocument();
  });

  it("disables the Global option and deploy when no tool is detected", async () => {
    // #134: with zero detected tools a global deploy would write files for a
    // tool that is not there, so the option is disabled — and since an empty
    // registry makes Global the effective target, the deploy button is too.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state/global")) {
          return jsonResponse({ tools: [], skipped: [] });
        }
        return jsonResponse({ primitives: [], skipped: [] });
      }),
    );
    renderAction(
      <DeploySkillAction skillName="tdd" repos={[]} registryReady />,
    );

    const globalOption = await within(
      screen.getByLabelText(/deploy tdd to/i),
    ).findByRole("option", { name: /Global \(no tools detected\)/ });
    expect(globalOption).toBeDisabled();
    expect(screen.getByRole("button", { name: /deploy/i })).toBeDisabled();
  });

  it("deploys the skill to the chosen repo", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
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
    const [url, init] = fetchMock.mock.calls.find(
      ([url]) => url === "/api/deploy",
    ) as unknown as [string, RequestInit];
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
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
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

    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === "/api/deploy",
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      type: "skill",
      name: "tdd",
      target: { kind: "global" },
    });
  });

  it("deploys globally when Global is chosen even with repos present", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
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

    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === "/api/deploy",
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      type: "skill",
      name: "tdd",
      target: { kind: "global" },
    });
  });

  it("shows already synced and offers re-deploy for a proven current target", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state")) {
          return jsonResponse({
            primitives: [{ type: "skill", name: "tdd", version: "v0.5.1" }],
            skipped: [],
          });
        }
        if (url.startsWith("/api/drift")) {
          return jsonResponse({ behind: [] });
        }
        if (url === "/api/deploy") {
          return jsonResponse({
            deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    renderAction(
      <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
    );

    expect(await screen.findByText("● already synced")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "re-deploy" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "deploy →" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "re-deploy" }));

    const deployCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      ([url]) => url === "/api/deploy",
    );
    if (!deployCall) throw new Error("expected a POST to /api/deploy");
    expect(JSON.parse((deployCall[1] as RequestInit).body as string)).toEqual({
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: "/projects/alpha" },
    });
  });

  it("returns to deploy when the selected target is not synced", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state")) {
          return jsonResponse({
            primitives: url.includes("beta")
              ? []
              : [{ type: "skill", name: "tdd", version: "v0.5.1" }],
            skipped: [],
          });
        }
        if (url.startsWith("/api/drift")) {
          return jsonResponse({ behind: [] });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    renderAction(
      <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
    );

    expect(await screen.findByText("● already synced")).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText(/deploy tdd to/i),
      "/projects/beta",
    );

    expect(
      await screen.findByRole("button", { name: "deploy →" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("● already synced")).not.toBeInTheDocument();
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
                "The local skill differs from its latest published tag. Tag and push the change first.",
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
      /tag and push the change/i,
    );
  });

  it("names the recorded package type, and offers no force that cannot help", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "deployed-unsupported-package-type",
              message:
                "apm installed this package but recorded it as a type Maestro cannot manage as a skill.",
              packageType: "hybrid",
            }),
            { status: 409, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    renderAction(
      <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
    );

    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /recorded type: hybrid/i,
    );
    expect(
      screen.queryByRole("button", { name: /reinstall fresh/i }),
    ).not.toBeInTheDocument();
  });

  it("offers an inline Reinstall-fresh confirm that re-deploys with force", async () => {
    // ADR-0006: a not-proven-clean copy is confirm-and-proceed at the Deploy
    // entry point too, not a refusal. The inline button re-runs the same deploy
    // with force: true — one behaviour, both entry points (#66).
    let deployCalls = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/deploy") && !url.includes("deploy-state")) {
          deployCalls += 1;
          if (deployCalls === 1) {
            return new Response(
              JSON.stringify({
                error: "deployed-unverifiable",
                message:
                  "This copy predates content tracking, so local changes can't be checked. Updating reinstalls fresh at the latest tag; any local changes are discarded.",
              }),
              { status: 409, headers: { "content-type": "application/json" } },
            );
          }
          return jsonResponse({
            deployed: { type: "skill", name: "tdd", version: "v0.5.1" },
          });
        }
        return jsonResponse({ primitives: [], skipped: [] });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    renderAction(
      <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
    );

    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /predates content tracking/i,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /reinstall fresh/i }),
    );

    const deployBodies = fetchMock.mock.calls
      .filter(
        ([url]) =>
          String(url).startsWith("/api/deploy") &&
          !String(url).includes("deploy-state"),
      )
      .map(([, init]) => JSON.parse((init as RequestInit).body as string));
    expect(deployBodies).toHaveLength(2);
    expect(deployBodies[1].force).toBe(true);
  });

  it("clears the Reinstall affordance when the target changes after a refusal", async () => {
    // A force must apply to the target just confirmed. Switching the dropdown
    // after a not-proven-clean refusal clears it (#66, Codex P2).
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy") && !url.includes("deploy-state")) {
        return new Response(
          JSON.stringify({
            error: "deployed-diverged-from-lock",
            message:
              "The deployed copy has local changes that never went through central. Updating discards them and reinstalls at the latest tag.",
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
      }
      return jsonResponse({ primitives: [], skipped: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAction(
      <DeploySkillAction skillName="tdd" repos={repos} registryReady />,
    );

    await userEvent.selectOptions(
      screen.getByLabelText(/deploy tdd to/i),
      "/projects/alpha",
    );
    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    expect(
      await screen.findByRole("button", { name: /reinstall fresh/i }),
    ).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText(/deploy tdd to/i),
      "/projects/beta",
    );

    expect(
      screen.queryByRole("button", { name: /reinstall fresh/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
        {/* Named, because the empty panel offers a `deploy →` of its own (#472). */}
        <section aria-label="Pane action">
          <DeploySkillAction
            skillName="tdd"
            repos={[{ path: "/projects/alpha" }]}
            registryReady
          />
        </section>
        <DeployStatePanel repo="/projects/alpha" onStartDeploy={() => {}} />
      </>,
    );

    // The panel has loaded and reads empty before the deploy.
    expect(await screen.findByText("● empty")).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole("region", { name: "Pane action" })).getByRole(
        "button",
        { name: "deploy →" },
      ),
    );

    // The panel updates without a reload: the deploy invalidated its query.
    expect(await screen.findByText("v0.5.1")).toBeInTheDocument();
  });

  it("refreshes the repo drift badge after a successful deploy", async () => {
    // Drift is a separate query from deploy-state; a deploy must invalidate
    // it too, or a freshly deployed skill keeps its stale badge (#48).
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/drift")) {
        return fetchMock.mock.calls.filter((c) =>
          String(c[0]).includes("/api/drift"),
        ).length <= 1
          ? jsonResponse({ ok: false })
          : jsonResponse({
              behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }],
            });
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
        <DeployStatePanel repo="/projects/alpha" onStartDeploy={() => {}} />
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
          ? jsonResponse({
              tools: [{ tool: "claude", primitives: [] }],
              skipped: [],
            })
          : jsonResponse({
              tools: [
                {
                  tool: "claude",
                  primitives: [
                    { type: "skill", name: "tdd", version: "v0.5.1" },
                  ],
                },
              ],
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
        {/* Named, because the empty panel offers a `deploy →` of its own (#472). */}
        <section aria-label="Pane action">
          <DeploySkillAction skillName="tdd" repos={[]} registryReady />
        </section>
        <GlobalDeployStatePanel onStartDeploy={() => {}} />
      </>,
    );

    // The panel has loaded and reads empty before the deploy.
    expect(await screen.findByText("● empty")).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole("region", { name: "Pane action" })).getByRole(
        "button",
        { name: "deploy →" },
      ),
    );

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
          : jsonResponse({
              behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }],
            });
      }
      if (url.startsWith("/api/deploy-state/global")) {
        return jsonResponse({
          tools: [
            {
              tool: "claude",
              primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
            },
          ],
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
        <GlobalDeployStatePanel onStartDeploy={() => {}} />
      </>,
    );

    expect(await screen.findByText(/unknown/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /deploy/i }));

    expect(await screen.findByText(/behind/i)).toBeInTheDocument();
  });
});
