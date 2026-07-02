import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
}: {
  repos?: Array<{ path: string }>;
  register?: () => Response;
  browse?: () => Response;
  configuredPath?: string | null;
} = {}) {
  const registered = [...repos];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse({ inventoryPath: configuredPath }, 200);
      }
      if (url.startsWith("/api/filesystem/children")) {
        return browse
          ? browse()
          : jsonResponse({ path: "/home/me", entries: [] }, 200);
      }
      if (url.startsWith("/api/registry/repos")) {
        if (init?.method === "POST") {
          if (register) {
            return register();
          }
          const { path } = JSON.parse(String(init.body)) as { path: string };
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

  it("fills the repo path field from a folder picked via browse", async () => {
    stubApi({
      browse: () =>
        jsonResponse({ path: "/home/me/acme-web", entries: [] }, 200),
    });
    renderView();

    await userEvent.click(
      await screen.findByRole("button", { name: /browse/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /select this folder/i }),
    );

    expect(screen.getByLabelText(/repo path/i)).toHaveValue(
      "/home/me/acme-web",
    );
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
});
