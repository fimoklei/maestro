import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../shell/app-router";
import { jsonResponse, renderWithQuery } from "../test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Every read of the connected frame a test does not answer itself.
function fallback(url: string) {
  if (url.startsWith("/api/harness")) {
    return jsonResponse(
      {
        origin: "github.com/fimoklei/agent-harness",
        releasedVersion: null,
        defaultBranch: "main",
        releaseState: "never-released",
        freshness: { outcome: null, lastFetchedAt: null },
        cloneSync: "current",
        stages: {
          proposal: { outcome: "read", rows: [], bound: null },
          review: { outcome: "read", rows: [], bound: null },
          release: { outcome: "read", rows: [], bound: null },
        },
      },
      200,
    );
  }
  return jsonResponse(
    { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
    200,
  );
}

// Stateful: config starts unconfigured and "connects" once POSTed.
function stubServer() {
  let inventoryPath: string | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse({ inventoryPath }, 200);
      }
      if (url.startsWith("/api/inventory/connect") && init?.method === "POST") {
        inventoryPath = "/home/me/agent-harness";
        return jsonResponse(
          { outcome: "found", inventoryPath, primitiveCount: 3 },
          200,
        );
      }
      return fallback(url);
    }),
  );
}

function renderApp(path: string) {
  return renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("connect gate", () => {
  it("walks a fresh install from welcome through connect and the success beat onto Inventory", async () => {
    stubServer();
    renderApp("/");

    // gate -> welcome
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "No Harness connected",
      }),
    ).toBeInTheDocument();

    // welcome -> connect
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Connect a Harness",
      }),
    ).toBeInTheDocument();

    // connect -> success beat
    await userEvent.type(
      screen.getByLabelText("Harness folder or GitHub URL"),
      "/home/me/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );
    expect(
      await screen.findByText("3 items are ready in the Inventory."),
    ).toBeInTheDocument();
    expect(screen.getByText("Harness connected")).toBeInTheDocument();

    // The beat holds until continue is pressed; no auto-navigate.
    expect(
      screen.queryByRole("heading", { name: /^inventory$/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(
      await screen.findByRole("heading", { name: /^inventory$/i }),
    ).toBeInTheDocument();
  });

  it("joins a Harness pasted as a GitHub url and lands on Inventory", async () => {
    let inventoryPath: string | null = null;
    const connectBodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath }, 200);
        }
        if (
          url.startsWith("/api/inventory/connect") &&
          init?.method === "POST"
        ) {
          connectBodies.push(String(init.body));
          inventoryPath = "/home/me/agent-harness";
          return jsonResponse(
            { outcome: "joined", inventoryPath, primitiveCount: 3 },
            200,
          );
        }
        return fallback(url);
      }),
    );
    renderApp("/welcome/connect");

    await userEvent.type(
      await screen.findByLabelText("Harness folder or GitHub URL"),
      "https://github.com/fimoklei/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );

    expect(connectBodies).toEqual([
      JSON.stringify({ path: "https://github.com/fimoklei/agent-harness" }),
    ]);
    expect(await screen.findByText("Harness connected")).toBeInTheDocument();
    expect(
      await screen.findByText("3 items are ready in the Inventory."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Teammates need their own GitHub and APM access to a private Harness.",
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(
      await screen.findByRole("heading", { name: /^inventory$/i }),
    ).toBeInTheDocument();
  });

  it("scaffolds an empty GitHub repository and lands on Harness", async () => {
    let inventoryPath: string | null = null;
    const scaffoldBodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath }, 200);
        }
        if (
          url.startsWith("/api/inventory/connect") &&
          init?.method === "POST"
        ) {
          return jsonResponse(
            {
              error: "scaffoldable",
              message: "That GitHub repository has no apm.yml.",
              path: "/home/me/team-harness",
            },
            422,
          );
        }
        // The view refreshes on mount, so both routes must answer in shape.
        if (url === "/api/harness" || url === "/api/harness/refresh") {
          return jsonResponse(
            {
              origin: "github.com/fimoklei/team-harness",
              releasedVersion: null,
              defaultBranch: "trunk",
              releaseState: "never-released",
              freshness: { outcome: null, lastFetchedAt: null },
              cloneSync: "current",
              stages: {
                proposal: { outcome: "read", rows: [], bound: null },
                review: { outcome: "read", rows: [], bound: null },
                release: { outcome: "read", rows: [], bound: null },
              },
            },
            200,
          );
        }
        if (
          url.startsWith("/api/harness/scaffold") &&
          init?.method === "POST"
        ) {
          scaffoldBodies.push(String(init.body));
          inventoryPath = "/home/me/team-harness";
          return jsonResponse(
            { outcome: "scaffolded", inventoryPath, primitiveCount: 0 },
            200,
          );
        }
        return fallback(url);
      }),
    );
    renderApp("/welcome/connect");

    await userEvent.type(
      await screen.findByLabelText("Harness folder or GitHub URL"),
      "https://github.com/fimoklei/team-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );

    // The offer appears in place: no second screen, no mode button.
    await userEvent.click(
      await screen.findByRole("button", { name: /scaffold the harness/i }),
    );

    // The path the offer carried, not the url the user typed.
    expect(scaffoldBodies).toEqual([
      JSON.stringify({ path: "/home/me/team-harness" }),
    ]);
    expect(await screen.findByText("Harness created")).toBeInTheDocument();
    expect(screen.getByText("It has no skills yet.")).toBeInTheDocument();
    expect(
      screen.queryByText(/skill checks do not block releases/i),
    ).not.toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: /continue/i }),
    );
    expect(
      await screen.findByRole("heading", { name: /^harness$/i }),
    ).toBeInTheDocument();
  });

  // #555: the retry carries the parent folder the user chose.
  it("recovers from an occupied destination by cloning into another folder", async () => {
    const connectBodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath: null }, 200);
        }
        if (url.startsWith("/api/folder-chooser")) {
          return init?.method === "POST"
            ? jsonResponse({ path: "/home/me" }, 200)
            : jsonResponse({ available: true }, 200);
        }
        if (
          url.startsWith("/api/inventory/connect") &&
          init?.method === "POST"
        ) {
          connectBodies.push(String(init.body));
          return jsonResponse(
            {
              error: "destination-occupied",
              message: "Something else already sits where that Harness lands.",
            },
            409,
          );
        }
        return fallback(url);
      }),
    );
    renderApp("/welcome/connect");

    await userEvent.type(
      await screen.findByLabelText("Harness folder or GitHub URL"),
      "https://github.com/fimoklei/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );

    // The refusal opens the clone folder field and moves under it (#1013).
    await userEvent.click(
      await screen.findByRole("button", { name: "Choose another folder" }),
    );
    const cloneField = await screen.findByLabelText("Folder for the Harness");
    expect(cloneField).toHaveAttribute("aria-invalid", "true");
    expect(cloneField).toHaveAccessibleDescription(/destination folder taken/i);
    const [, cloneBrowse] = screen.getAllByRole("button", { name: "Browse" });
    await userEvent.click(cloneBrowse as HTMLElement);

    expect(
      await screen.findByText("/home/me/agent-harness"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );
    expect(JSON.parse(connectBodies[1] ?? "{}")).toEqual({
      path: "https://github.com/fimoklei/agent-harness",
      parent: "/home/me",
    });
  });

  it("advertises no register-repos step and no progress strip", async () => {
    stubServer();
    renderApp("/welcome");

    await screen.findByRole("heading", { level: 1 });

    expect(screen.queryByText(/register repos/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/step 1 of 3/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d\s·\s/)).not.toBeInTheDocument();
  });

  // The access note belongs to a clone's success, not the form (#1391).
  it("keeps the private-Harness access note off the connect screen", async () => {
    stubServer();
    renderApp("/welcome/connect");

    await screen.findByRole("heading", { level: 1, name: "Connect a Harness" });
    expect(screen.queryByText(/private harness/i)).not.toBeInTheDocument();
  });

  it("states clone progress while a GitHub URL is still connecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath: null }, 200);
        }
        if (
          url.startsWith("/api/inventory/connect") &&
          init?.method === "POST"
        ) {
          return new Promise<Response>(() => {});
        }
        return fallback(url);
      }),
    );
    renderApp("/welcome/connect");

    await userEvent.type(
      await screen.findByLabelText("Harness folder or GitHub URL"),
      "https://github.com/fimoklei/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Cloning can take a minute.");
    expect(status).not.toHaveTextContent(/%/);
  });

  it.each(["/welcome/repos", "/nonsense"])(
    "sends %s somewhere real rather than rendering nothing",
    async (route) => {
      // A stale bookmark can still ask for the retired /welcome/repos.
      stubServer();
      renderApp(route);

      expect(
        await screen.findByRole("heading", {
          level: 1,
          name: "No Harness connected",
        }),
      ).toBeInTheDocument();
    },
  );

  it.each(["/welcome", "/welcome/connect"])(
    "redirects a configured install away from %s into the cockpit",
    async (route) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).startsWith("/api/inventory/config")
            ? jsonResponse({ inventoryPath: "/home/me/agent-harness" }, 200)
            : jsonResponse(
                {
                  ok: true,
                  repos: [],
                  primitives: [],
                  skipped: [],
                  behind: [],
                },
                200,
              ),
        ),
      );
      renderApp(route);

      expect(
        await screen.findByRole("heading", { name: /deploy-state/i }),
      ).toBeInTheDocument();
      // No gate screen rendered on the way there; the gate's title is the
      // marker, since every screen names itself in band 1.
      expect(
        screen.queryByRole("heading", { name: "No Harness connected" }),
      ).not.toBeInTheDocument();
    },
  );

  it("lands on Inventory even when the config refetch after connect is still in flight", async () => {
    // invalidateQueries does not update the cache synchronously, so the first-run
    // gate could bounce to /welcome. The refetch is held open to prove it does not.
    let inventoryPath: string | null = null;
    let configRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          configRequests += 1;
          if (configRequests > 1) {
            return new Promise<Response>(() => {}); // never resolves
          }
          return jsonResponse({ inventoryPath }, 200);
        }
        if (
          url.startsWith("/api/inventory/connect") &&
          init?.method === "POST"
        ) {
          inventoryPath = "/home/me/agent-harness";
          return jsonResponse(
            { outcome: "found", inventoryPath, primitiveCount: 3 },
            200,
          );
        }
        return fallback(url);
      }),
    );
    renderApp("/welcome/connect");

    await userEvent.type(
      await screen.findByLabelText("Harness folder or GitHub URL"),
      "/home/me/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Connect Harness" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /continue/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /^inventory$/i }),
    ).toBeInTheDocument();
    // Inventory's own <h1> must be the only one: no gate heading rode along.
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/^inventory$/i);
  });
});
