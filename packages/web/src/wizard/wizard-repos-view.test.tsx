import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WizardReposView } from "./wizard-repos-view";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubApi({
  repos = [],
  register,
  browse,
  configuredPath = "/home/me/agent-harness",
  configFailsOnce = false,
}: {
  repos?: Array<{ path: string }>;
  register?: (path: string) => Response;
  browse?: () => Response;
  configuredPath?: string | null;
  configFailsOnce?: boolean;
} = {}) {
  const registered = [...repos];
  let configCalls = 0;
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/config")) {
        configCalls += 1;
        if (configFailsOnce && configCalls === 1) {
          return jsonResponse({ message: "unreachable" }, 500);
        }
        return jsonResponse({ inventoryPath: configuredPath }, 200);
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
      if (url.startsWith("/api/registry/repos")) {
        if (init?.method === "POST") {
          const { path } = JSON.parse(String(init.body)) as { path: string };
          if (register) {
            const response = register(path);
            // Mirror the server: a 201 answers with the whole registry, and
            // that answer is what a later list call must agree with — the
            // stored path is not always the one that was sent.
            if (response.status === 201) {
              registered.length = 0;
              registered.push(
                ...(
                  (await response.clone().json()) as {
                    repos: { path: string }[];
                  }
                ).repos,
              );
            }
            return response;
          }
          registered.push({ path });
          return jsonResponse({ repos: registered }, 201);
        }
        return jsonResponse({ repos: registered }, 200);
      }
      return jsonResponse({ ok: true }, 200);
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
      <MemoryRouter initialEntries={["/welcome/repos"]}>
        <Routes>
          <Route path="/welcome/repos" element={<WizardReposView />} />
          <Route path="/welcome" element={<div>welcome-landed</div>} />
          <Route path="/" element={<div>deploy-state-landed</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("WizardReposView", () => {
  it("shows the register step with already-registered repos and the progress on step 2", async () => {
    stubApi({ repos: [{ path: "/home/me/acme-web" }] });
    renderView();

    expect(
      await screen.findByRole("heading", { name: /register consuming repos/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText("/home/me/acme-web")).toBeInTheDocument();
    expect(screen.getByText(/2 · register repos/i)).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("offers one + repo button and no path field of its own (issue #175)", async () => {
    stubApi();
    renderView();

    expect(
      await screen.findByRole("button", { name: /\+ repo/i }),
    ).toBeInTheDocument();
    // The picker's own paste field is the only way to hand-type a path now.
    expect(screen.queryByLabelText(/repo path/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /register repo/i }),
    ).not.toBeInTheDocument();
  });

  it("registers a path pasted into the picker and lists it", async () => {
    stubApi();
    renderView();

    await userEvent.click(
      await screen.findByRole("button", { name: /\+ repo/i }),
    );
    await userEvent.type(
      await screen.findByRole("textbox", { name: /or paste/i }),
      "/home/me/acme-web",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /register 1 selected/i }),
    );
    await userEvent.click(await screen.findByRole("button", { name: /done/i }));

    expect(await screen.findByText("/home/me/acme-web")).toBeInTheDocument();
  });

  it("lands on Deploy-state via skip without registering anything", async () => {
    const fetchMock = stubApi();
    renderView();

    await userEvent.click(await screen.findByRole("button", { name: /skip/i }));

    expect(await screen.findByText("deploy-state-landed")).toBeInTheDocument();
    const registerPosts = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).startsWith("/api/registry/repos") &&
        init?.method === "POST",
    );
    expect(registerPosts).toHaveLength(0);
  });

  it("lands on Deploy-state via continue once a repo is registered", async () => {
    stubApi();
    renderView();

    // No finish affordance before anything is registered — skip is the exit.
    expect(
      screen.queryByRole("button", { name: /continue/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      await screen.findByRole("button", { name: /\+ repo/i }),
    );
    await userEvent.type(
      await screen.findByRole("textbox", { name: /or paste/i }),
      "/home/me/acme-web",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /register 1 selected/i }),
    );
    await userEvent.click(await screen.findByRole("button", { name: /done/i }));

    await userEvent.click(
      await screen.findByRole("button", { name: /continue/i }),
    );
    expect(await screen.findByText("deploy-state-landed")).toBeInTheDocument();
  });

  describe("multi-select registration (issue #151)", () => {
    // A folder of two git repos, so one browse session can register both.
    const repoListing = () =>
      jsonResponse(
        {
          path: "/home/me",
          breadcrumbs: [{ name: "~", path: "/home/me" }],
          entries: [
            {
              name: "acme-web",
              path: "/home/me/acme-web",
              isHidden: false,
              isSymlink: false,
              facts: { isGitRepo: true, hasSkillsSubdir: false },
            },
            {
              name: "payments-api",
              path: "/home/me/payments-api",
              isHidden: false,
              isSymlink: false,
              facts: { isGitRepo: true, hasSkillsSubdir: false },
            },
          ],
        },
        200,
      );

    async function selectBothRepos() {
      await userEvent.click(
        await screen.findByRole("button", { name: /\+ repo/i }),
      );
      await userEvent.click(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      );
      await userEvent.click(
        screen.getByRole("checkbox", { name: /payments-api/i }),
      );
      await userEvent.click(
        screen.getByRole("button", { name: /register 2 selected/i }),
      );
    }

    // The run's own list, inside the picker — distinct from the wizard's list
    // of registered repos behind it.
    const report = () => screen.findByRole("list", { name: /result/i });

    it("registers every selected repo and lists them all once the picker closes", async () => {
      const fetchMock = stubApi({ browse: repoListing });
      renderView();
      await selectBothRepos();

      await waitFor(async () =>
        expect(await report()).toHaveTextContent("/home/me/payments-api"),
      );
      await userEvent.click(screen.getByRole("button", { name: /done/i }));

      const registered = await screen.findByRole("list", {
        name: /registered repos/i,
      });
      expect(registered).toHaveTextContent("/home/me/acme-web");
      expect(registered).toHaveTextContent("/home/me/payments-api");

      const registerPosts = fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input).startsWith("/api/registry/repos") &&
          init?.method === "POST",
      );
      expect(registerPosts).toHaveLength(2);
    });

    it("reports each repo's outcome in the picker, not on the wizard's rows", async () => {
      stubApi({
        repos: [{ path: "/home/me/already-there" }],
        browse: repoListing,
      });
      renderView();
      await selectBothRepos();

      await waitFor(async () =>
        expect(await report()).toHaveTextContent("/home/me/payments-api"),
      );
      const reported = within(await report()).getAllByRole("listitem");
      expect(reported[0]).toHaveTextContent("/home/me/acme-web");
      expect(reported[0]).toHaveTextContent("✓");
      expect(reported[0]).toHaveTextContent("registered");

      // The wizard's own list carries no run outcome — successes speak for
      // themselves as registered repos (issue #175).
      await userEvent.click(screen.getByRole("button", { name: /done/i }));
      const registered = await screen.findByRole("list", {
        name: /registered repos/i,
      });
      expect(registered).not.toHaveTextContent("✓");
      expect(registered).toHaveTextContent("/home/me/already-there");
    });

    it("lists each registered repo exactly once", async () => {
      stubApi({ browse: repoListing });
      renderView();
      await selectBothRepos();

      await waitFor(async () =>
        expect(await report()).toHaveTextContent("/home/me/payments-api"),
      );
      await userEvent.click(screen.getByRole("button", { name: /done/i }));

      await screen.findByText("/home/me/acme-web");
      expect(screen.getAllByText("/home/me/acme-web")).toHaveLength(1);
      expect(screen.getAllByText("/home/me/payments-api")).toHaveLength(1);
    });

    it("reports the path the server actually stored when one resolves elsewhere", async () => {
      // Registration canonicalizes with realpath, so a symlinked repo lands
      // under its target. The report has to name the path the registry holds,
      // not the one the picker sent.
      stubApi({
        browse: repoListing,
        register: () =>
          jsonResponse({ repos: [{ path: "/home/me/real-target" }] }, 201),
      });
      renderView();

      await userEvent.click(
        await screen.findByRole("button", { name: /\+ repo/i }),
      );
      await userEvent.type(
        await screen.findByRole("textbox", { name: /or paste/i }),
        "/home/me/symlinked",
      );
      await userEvent.click(
        screen.getByRole("button", { name: /register 1 selected/i }),
      );

      const row = within(await report()).getByRole("listitem");
      expect(row).toHaveTextContent("/home/me/real-target");
      expect(row).toHaveTextContent("✓");
      expect(screen.queryByText("/home/me/symlinked")).not.toBeInTheDocument();
    });

    it("reports a failure even for a path the registry already holds", async () => {
      // A registered directory deleted off disk: its path is still in the
      // registry, so the failure has nowhere to show except the run's report.
      stubApi({
        repos: [{ path: "/home/me/gone" }],
        browse: repoListing,
        register: () =>
          jsonResponse(
            { error: "not-found", message: "No directory exists there." },
            400,
          ),
      });
      renderView();

      await userEvent.click(
        await screen.findByRole("button", { name: /\+ repo/i }),
      );
      await userEvent.type(
        await screen.findByRole("textbox", { name: /or paste/i }),
        "/home/me/gone",
      );
      await userEvent.click(
        screen.getByRole("button", { name: /register 1 selected/i }),
      );

      expect(await report()).toHaveTextContent(
        /skipped · No directory exists there/,
      );
    });

    it("keeps registering after one repo fails, and says why it was skipped", async () => {
      let posts = 0;
      stubApi({
        browse: repoListing,
        register: () => {
          posts += 1;
          return posts === 1
            ? jsonResponse(
                { error: "not-found", message: "No directory exists there." },
                400,
              )
            : jsonResponse({ repos: [{ path: "/home/me/payments-api" }] }, 201);
        },
      });
      renderView();
      await selectBothRepos();

      await waitFor(async () =>
        expect(await report()).toHaveTextContent("/home/me/payments-api"),
      );
      const list = await report();
      expect(list).toHaveTextContent("✕");
      expect(list).toHaveTextContent(/skipped · No directory exists there/);
      // The failure did not stop the run: the second repo still registered.
      expect(posts).toBe(2);
    });

    it("holds the picker open while the run works, then hands back the exits", async () => {
      stubApi({ browse: repoListing });
      renderView();
      await selectBothRepos();

      // The report is up before the run finishes — the dialog never closes on
      // confirm in register mode (issue #175).
      expect(await report()).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /done/i })).toBeEnabled(),
      );
      expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
      expect(screen.getByRole("button", { name: /cancel/i })).toBeEnabled();
    });

    it("opens a later picker session on browsing, not on the last run's report", async () => {
      stubApi({ browse: repoListing });
      renderView();
      await selectBothRepos();

      await waitFor(async () =>
        expect(await report()).toHaveTextContent("/home/me/payments-api"),
      );
      await userEvent.click(screen.getByRole("button", { name: /done/i }));
      await userEvent.click(screen.getByRole("button", { name: /\+ repo/i }));

      expect(
        await screen.findByRole("checkbox", { name: /acme-web/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("list", { name: /result/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("redirects an unconfigured deep link back to the welcome gate", async () => {
    stubApi({ configuredPath: null });
    renderView();

    // Checked synchronously: the register step must not flash into view while
    // the cockpit doesn't yet know whether this user is configured (same
    // guard as the connect step).
    expect(
      screen.queryByRole("button", { name: /\+ repo/i }),
    ).not.toBeInTheDocument();

    expect(await screen.findByText("welcome-landed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /\+ repo/i }),
    ).not.toBeInTheDocument();
  });

  it("shows a readable error with retry when the config fetch fails, instead of hanging on Loading", async () => {
    stubApi({ configFailsOnce: true });
    renderView();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not (be )?reach.*maestro/i);
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /\+ repo/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("renders the register step once a retried config fetch succeeds", async () => {
    stubApi({ configFailsOnce: true });
    renderView();

    await userEvent.click(
      await screen.findByRole("button", { name: /try again/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /register consuming repos/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
