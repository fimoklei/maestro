import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("registers a pasted repo path and lists it", async () => {
    stubApi();
    renderView();

    await userEvent.type(
      await screen.findByLabelText(/repo path/i),
      "/home/me/acme-web",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /register repo/i }),
    );

    expect(await screen.findByText("/home/me/acme-web")).toBeInTheDocument();
    // The field clears so the next repo can be added without hand-erasing.
    expect(screen.getByLabelText(/repo path/i)).toHaveValue("");
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

    await userEvent.type(
      await screen.findByLabelText(/repo path/i),
      "/home/me/acme-web",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /register repo/i }),
    );

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
        await screen.findByRole("button", { name: /browse/i }),
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

    it("registers every selected repo and lists them all", async () => {
      const fetchMock = stubApi({ browse: repoListing });
      renderView();
      await selectBothRepos();

      const registered = await screen.findByRole("list", {
        name: /registered repos/i,
      });
      await waitFor(() =>
        expect(registered).toHaveTextContent("/home/me/payments-api"),
      );
      expect(registered).toHaveTextContent("/home/me/acme-web");

      const registerPosts = fetchMock.mock.calls.filter(
        ([input, init]) =>
          String(input).startsWith("/api/registry/repos") &&
          init?.method === "POST",
      );
      expect(registerPosts).toHaveLength(2);
    });

    it("marks each selected repo's outcome on its row in the repo list", async () => {
      // One list, not two: the outcome decorates the repo's canonical row
      // rather than repeating it in a separate results block.
      stubApi({
        repos: [{ path: "/home/me/already-there" }],
        browse: repoListing,
      });
      renderView();
      await selectBothRepos();

      const rows = await screen.findAllByRole("listitem");
      const acme = rows.find((row) =>
        row.textContent?.includes("/home/me/acme-web"),
      );
      expect(acme).toHaveTextContent("✓");
      expect(acme).toHaveTextContent("registered");

      // A repo that was not part of this batch keeps its plain row.
      const untouched = rows.find((row) =>
        row.textContent?.includes("/home/me/already-there"),
      );
      expect(untouched).not.toHaveTextContent("✓");
    });

    it("lists each selected repo exactly once", async () => {
      stubApi({ browse: repoListing });
      renderView();
      await selectBothRepos();

      await screen.findByText("/home/me/acme-web");
      expect(screen.getAllByText("/home/me/acme-web")).toHaveLength(1);
      expect(screen.getAllByText("/home/me/payments-api")).toHaveLength(1);
    });

    it("drops a stale manual-registration error once a selection registers", async () => {
      // Otherwise the failed paste's error sits underneath a list of ticks,
      // telling the user two contradictory things at once.
      let posts = 0;
      const stored: { path: string }[] = [];
      stubApi({
        browse: repoListing,
        register: (path) => {
          posts += 1;
          if (posts === 1) {
            return jsonResponse(
              { error: "relative", message: "Path must be an absolute path." },
              400,
            );
          }
          stored.push({ path });
          return jsonResponse({ repos: [...stored] }, 201);
        },
      });
      renderView();

      // A hand-typed path that the server rejects.
      await userEvent.type(
        await screen.findByLabelText(/repo path/i),
        "./not-absolute",
      );
      await userEvent.click(
        screen.getByRole("button", { name: /register repo/i }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        /absolute path/i,
      );

      await selectBothRepos();

      await screen.findByText("/home/me/acme-web");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("marks the row the server actually stored when a path resolves elsewhere", async () => {
      // Registration canonicalizes with realpath, so a symlinked repo lands
      // under its target. The outcome has to follow the path the registry
      // holds, not the one the picker sent, or the row never gets its tick.
      stubApi({
        browse: repoListing,
        register: () =>
          jsonResponse({ repos: [{ path: "/home/me/real-target" }] }, 201),
      });
      renderView();

      await userEvent.click(
        await screen.findByRole("button", { name: /browse/i }),
      );
      await userEvent.type(
        await screen.findByRole("textbox", { name: /or paste/i }),
        "/home/me/symlinked",
      );
      await userEvent.click(
        screen.getByRole("button", { name: /register 1 selected/i }),
      );

      const row = (await screen.findAllByRole("listitem")).find((item) =>
        item.textContent?.includes("/home/me/real-target"),
      );
      expect(row).toHaveTextContent("✓");
      expect(screen.queryByText("/home/me/symlinked")).not.toBeInTheDocument();
    });

    it("gives a failed repo one row even when a stale entry already lists it", async () => {
      // A registered directory deleted off disk: its path is still in the
      // registry, so a failed re-registration must decorate that row rather
      // than add a second one for the same path.
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
        await screen.findByRole("button", { name: /browse/i }),
      );
      await userEvent.type(
        await screen.findByRole("textbox", { name: /or paste/i }),
        "/home/me/gone",
      );
      await userEvent.click(
        screen.getByRole("button", { name: /register 1 selected/i }),
      );

      await screen.findByText(/skipped · No directory exists there/);
      expect(screen.getAllByText("/home/me/gone")).toHaveLength(1);
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

      const list = await screen.findByRole("list", {
        name: /registered repos/i,
      });
      // The failed repo is not in the registry, so it earns its own row.
      expect(list).toHaveTextContent("✕");
      expect(list).toHaveTextContent(/skipped · No directory exists there/);
      // The failure did not stop the run: the second repo still registered…
      expect(posts).toBe(2);
      // …and its success persisted into the same list.
      expect(list).toHaveTextContent("/home/me/payments-api");
    });
  });

  it("redirects an unconfigured deep link back to the welcome gate", async () => {
    stubApi({ configuredPath: null });
    renderView();

    // Checked synchronously: the register form must not flash into view while
    // the cockpit doesn't yet know whether this user is configured (same
    // guard as the connect step).
    expect(screen.queryByLabelText(/repo path/i)).not.toBeInTheDocument();

    expect(await screen.findByText("welcome-landed")).toBeInTheDocument();
    expect(screen.queryByLabelText(/repo path/i)).not.toBeInTheDocument();
  });

  it("shows a readable error with retry when the config fetch fails, instead of hanging on Loading", async () => {
    stubApi({ configFailsOnce: true });
    renderView();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not (be )?reach.*maestro/i);
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/repo path/i)).not.toBeInTheDocument();
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
