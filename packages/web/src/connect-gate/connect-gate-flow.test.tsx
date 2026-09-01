import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../shell/app-router";
import { jsonResponse, renderWithQuery } from "../test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Stateful: config starts unconfigured, "connects" once POSTed — mirrors
// server-state (frontend.md), not a static fixture.
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
      return jsonResponse(
        { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
        200,
      );
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
        name: /inventory not connected/i,
      }),
    ).toBeInTheDocument();

    // welcome -> connect
    await userEvent.click(
      screen.getByRole("button", { name: /connect inventory/i }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /inventory connection/i,
      }),
    ).toBeInTheDocument();

    // connect -> success beat
    await userEvent.type(
      screen.getByLabelText(/inventory path/i),
      "/home/me/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );
    expect(await screen.findByText(/3 primitives found/i)).toBeInTheDocument();
    expect(
      screen.getByText(/deploys never write back to this harness/i),
    ).toBeInTheDocument();

    // The beat holds until the continue action is taken — it does not
    // auto-navigate the instant the mutation resolves (ADR-0015).
    expect(
      screen.queryByRole("heading", { name: /^inventory$/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(
      await screen.findByRole("heading", { name: /^inventory$/i }),
    ).toBeInTheDocument();
  });

  // Joining by URL is the same gate, the same field and the same landing: only
  // the server's outcome differs (#554).
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
        return jsonResponse(
          { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
          200,
        );
      }),
    );
    renderApp("/welcome/connect");

    await userEvent.type(
      await screen.findByLabelText(/inventory path/i),
      "https://github.com/fimoklei/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );

    expect(connectBodies).toEqual([
      JSON.stringify({ path: "https://github.com/fimoklei/agent-harness" }),
    ]);
    expect(await screen.findByText(/harness joined/i)).toBeInTheDocument();
    expect(await screen.findByText(/3 primitives found/i)).toBeInTheDocument();
    expect(screen.getByText(/cloned harness/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/deploys never write back to this harness/i),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(
      await screen.findByRole("heading", { name: /^inventory$/i }),
    ).toBeInTheDocument();
  });

  // Scaffolding is the same gate and the same field too: the refusal to
  // connect carries the offer, and accepting it lands on Harness (#556).
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
        // A freshly scaffolded Harness: nothing released, nothing pending.
        // The view refreshes on mount, so both routes must answer in shape.
        if (url === "/api/harness" || url === "/api/harness/refresh") {
          return jsonResponse(
            {
              origin: "github.com/fimoklei/team-harness",
              releasedVersion: null,
              defaultBranch: "trunk",
              releaseState: "never-released",
              pendingRelease: [],
              freshness: { outcome: null, lastFetchedAt: null },
              movements: [],
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
        return jsonResponse(
          { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
          200,
        );
      }),
    );
    renderApp("/welcome/connect");

    await userEvent.type(
      await screen.findByLabelText(/inventory path/i),
      "https://github.com/fimoklei/team-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );

    // The offer appears in place: no second screen, no mode button.
    await userEvent.click(
      await screen.findByRole("button", { name: /scaffold the harness/i }),
    );

    // The path the offer carried, not the url the user typed.
    expect(scaffoldBodies).toEqual([
      JSON.stringify({ path: "/home/me/team-harness" }),
    ]);
    expect(await screen.findByText(/harness scaffolded/i)).toBeInTheDocument();
    expect(screen.getByText(/harness is empty/i)).toBeInTheDocument();
    expect(
      screen.getByText(/skill-check workflow is advisory/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /only becomes a gate if the team makes it a required check/i,
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole("button", { name: /continue/i }),
    );
    expect(
      await screen.findByRole("heading", { name: /^harness$/i }),
    ).toBeInTheDocument();
  });

  // The whole recovery journey for #555: the refused destination hands the
  // user the parent picker, and the retry carries the folder they chose.
  it("recovers from an occupied destination by cloning into another folder", async () => {
    const connectBodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/inventory/config")) {
          return jsonResponse({ inventoryPath: null }, 200);
        }
        if (url.startsWith("/api/filesystem/children")) {
          return jsonResponse(
            {
              path: "/home/me",
              breadcrumbs: [{ name: "~", path: "/home/me" }],
              entries: [],
            },
            200,
          );
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
        return jsonResponse(
          { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
          200,
        );
      }),
    );
    renderApp("/welcome/connect");

    await userEvent.type(
      await screen.findByLabelText(/inventory path/i),
      "https://github.com/fimoklei/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );

    // The refusal offers the one action that clears it, and it opens the
    // picker for the parent folder — not the one for a local Harness.
    await userEvent.click(
      await screen.findByRole("button", { name: /choose another folder/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /clone into this folder/i }),
    );

    expect(screen.getByText("/home/me/agent-harness")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
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
    // The retired strip numbered its steps ("1 · connect inventory",
    // "2 · register repos", "3 · deploy"); nothing numbers a step now.
    expect(screen.queryByText(/\d\s·\s/)).not.toBeInTheDocument();
  });

  it("shows the private-Harness access note on the connect screen", async () => {
    stubServer();
    renderApp("/welcome/connect");

    expect(
      await screen.findByText(
        /a private harness works only when every teammate has their own github and apm access/i,
      ),
    ).toBeInTheDocument();
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
        return jsonResponse(
          { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
          200,
        );
      }),
    );
    renderApp("/welcome/connect");

    await userEvent.type(
      await screen.findByLabelText(/inventory path/i),
      "https://github.com/fimoklei/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/is cloned first/i);
    expect(status).not.toHaveTextContent(/%/);
  });

  it.each(["/welcome/repos", "/nonsense"])(
    "sends %s somewhere real rather than rendering nothing",
    async (route) => {
      // /welcome/repos was the retired register step's URL, so a stale
      // bookmark or a resumed session can still ask for it. With no route
      // matching and no catch-all, the user would get a blank page.
      stubServer();
      renderApp(route);

      expect(
        await screen.findByRole("heading", {
          level: 1,
          name: /inventory not connected/i,
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
      // No gate screen rendered on the way there: the gate's <h1> is the
      // marker, and the cockpit's own section headings are <h2>.
      expect(
        screen.queryByRole("heading", { level: 1 }),
      ).not.toBeInTheDocument();
    },
  );

  it("lands on Inventory even when the config refetch after connect is still in flight", async () => {
    // Race (Codex review finding): invalidateQueries schedules a refetch but
    // doesn't update the cache synchronously, so useFirstRun could still
    // bounce to /welcome. Holds the refetch open to prove landing doesn't need it.
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
        return jsonResponse(
          { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
          200,
        );
      }),
    );
    renderApp("/welcome/connect");

    await userEvent.type(
      await screen.findByLabelText(/inventory path/i),
      "/home/me/agent-harness",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^connect inventory$/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /continue/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /^inventory$/i }),
    ).toBeInTheDocument();
    // Inventory carries its own <h1> now (heading navigation needs a starting
    // point on that route) — the invariant this guards is that it's the only
    // one, so no stray gate heading rode along.
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent(/^inventory$/i);
  });
});
