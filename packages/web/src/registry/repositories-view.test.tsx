import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { RepositoriesView } from "./repositories-view";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const repoFacts = { isGitRepo: true, hasApmManifest: false };

// Stateful registry: empty until a POST registers a repo, after which the list
// refetches. A refused path answers 400.
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
            return jsonResponse({ error: "not-a-directory" }, 400);
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

function renderView() {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/repositories"]}>
      <RepositoriesView />
    </MemoryRouter>,
  );
}

const REGISTER = "Register repository";

async function pickBothRepos() {
  await userEvent.click(await screen.findByRole("button", { name: REGISTER }));
  await userEvent.click(
    await screen.findByRole("checkbox", { name: /acme-web/i }),
  );
  await userEvent.click(
    screen.getByRole("checkbox", { name: /payments-api/i }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: /Register 2 repositories/ }),
  );
}

describe("Repositories", () => {
  it("names the screen and puts Register repository in band 1", async () => {
    stubServer();
    renderView();

    expect(
      screen.getByRole("heading", { level: 1, name: "Repositories" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: REGISTER })).toBeEnabled();
  });

  it("states an empty registry as its own empty state, not as a failure", async () => {
    stubServer();
    renderView();

    expect(await screen.findByText("No repositories yet")).toBeInTheDocument();
  });

  it("registers every repo checked in the picker and lists them", async () => {
    stubServer();
    renderView();

    await pickBothRepos();

    const list = await screen.findByRole("list", {
      name: "Registered repositories",
    });
    expect(
      await within(list).findByTitle("/home/me/acme-web"),
    ).toBeInTheDocument();
    expect(
      await within(list).findByTitle("/home/me/payments-api"),
    ).toBeInTheDocument();
  });

  it("reports a failed repo inside the picker while the rest still register", async () => {
    stubServer({ rejecting: ["/home/me/acme-web"] });
    renderView();

    await pickBothRepos();

    const report = await screen.findByRole("list", {
      name: "Registration results",
    });
    expect(
      within(report).getByText(/Skipped · That path names a file/i),
    ).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Registered repositories" });
    expect(
      await within(list).findByTitle("/home/me/payments-api"),
    ).toBeInTheDocument();
    expect(
      within(list).queryByTitle("/home/me/acme-web"),
    ).not.toBeInTheDocument();
  });

  it("hands the picker the repos already registered, so they cannot be picked twice", async () => {
    stubServer({ alreadyRegistered: ["/home/me/acme-web"] });
    renderView();

    await userEvent.click(
      await screen.findByRole("button", { name: REGISTER }),
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
    renderView();

    await userEvent.click(
      await screen.findByRole("button", { name: REGISTER }),
    );

    expect(
      await screen.findByRole("checkbox", { name: /agent-harness/i }),
    ).toBeDisabled();
    expect(screen.getByText("Current Inventory")).toBeInTheDocument();
  });

  it("has no path input of its own — the picker's paste field is the one", async () => {
    stubServer();
    renderView();

    await screen.findByRole("button", { name: REGISTER });
    expect(screen.queryByLabelText(/repo path/i)).not.toBeInTheDocument();
  });
});
