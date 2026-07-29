import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const repoFacts = { isGitRepo: true, hasSkillsSubdir: false };

// Stateful registry: empty until a POST registers a repo, after which the
// Targets list refetches. A refused path answers 400.
function stubServer({
  rejecting = [] as string[],
  alreadyRegistered = [] as string[],
  includeInventory = false,
} = {}) {
  let repos = alreadyRegistered.map((path) => ({ path }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const target = String(input);
      if (target.includes("/api/inventory/config")) {
        return jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200);
      }
      if (target.includes("/api/filesystem/children")) {
        return jsonResponse(
          {
            path: "/home/me",
            breadcrumbs: [{ name: "~", path: "/home/me" }],
            entries: [
              { name: "acme-web", path: "/home/me/acme-web", facts: repoFacts },
              {
                name: "payments-api",
                path: "/home/me/payments-api",
                facts: repoFacts,
              },
              ...(includeInventory
                ? [
                    {
                      name: "agent-harness",
                      path: "/home/me/agent-harness",
                      facts: repoFacts,
                    },
                  ]
                : []),
            ],
          },
          200,
        );
      }
      if (target.includes("/api/registry/repos")) {
        if (init?.method === "POST") {
          const { path } = JSON.parse(String(init.body)) as { path: string };
          if (rejecting.includes(path)) {
            return jsonResponse({ message: "Path is not a directory." }, 400);
          }
          repos = [...repos, { path }];
          return jsonResponse({ repos }, 201);
        }
        return jsonResponse({ repos }, 200);
      }
      return jsonResponse({ primitives: [], skipped: [], behind: [] }, 200);
    }),
  );
}

function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function pickBothRepos() {
  await userEvent.click(await screen.findByRole("button", { name: "+ repo" }));
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

describe("sidebar register affordance", () => {
  it("registers every repo checked in the picker and lists them as targets", async () => {
    stubServer();
    renderSidebar();

    await pickBothRepos();

    const targets = await screen.findByRole("list", { name: "Targets" });
    expect(
      await within(targets).findByTitle("/home/me/acme-web"),
    ).toBeInTheDocument();
    expect(
      await within(targets).findByTitle("/home/me/payments-api"),
    ).toBeInTheDocument();
  });

  it("reports a failed repo inside the picker while the rest still register", async () => {
    stubServer({ rejecting: ["/home/me/acme-web"] });
    renderSidebar();

    await pickBothRepos();

    const report = await screen.findByRole("list", {
      name: "Registration results",
    });
    expect(
      within(report).getByText(/skipped · Path is not a directory/i),
    ).toBeInTheDocument();
    const targets = screen.getByRole("list", { name: "Targets" });
    expect(
      await within(targets).findByTitle("/home/me/payments-api"),
    ).toBeInTheDocument();
    expect(
      within(targets).queryByTitle("/home/me/acme-web"),
    ).not.toBeInTheDocument();
  });

  it("hands the picker the repos already registered, so they cannot be picked twice", async () => {
    stubServer({ alreadyRegistered: ["/home/me/acme-web"] });
    renderSidebar();

    await userEvent.click(
      await screen.findByRole("button", { name: "+ repo" }),
    );

    expect(
      await screen.findByRole("checkbox", { name: /acme-web/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: /payments-api/i }),
    ).toBeEnabled();
  });

  it("shows the connected inventory as unavailable in the picker", async () => {
    stubServer({ includeInventory: true });
    renderSidebar();

    await userEvent.click(
      await screen.findByRole("button", { name: "+ repo" }),
    );

    expect(
      await screen.findByRole("checkbox", { name: /agent-harness/i }),
    ).toBeDisabled();
    expect(screen.getByText("central inventory")).toBeInTheDocument();
  });

  it("has no path input of its own — the picker's paste field is the one", async () => {
    stubServer();
    renderSidebar();

    await screen.findByRole("button", { name: "+ repo" });
    expect(screen.queryByLabelText(/repo path/i)).not.toBeInTheDocument();
  });
});
