import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { BulkDeployAction } from "./bulk-deploy-action";

afterEach(() => {
  vi.unstubAllGlobals();
});

// Stubs the reads (nothing deployed, drift up to date); the bulk route returns
// the test's `bulkReport`.
function stubReads(bulkReport: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
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
      if (url.startsWith("/api/drift/global")) {
        return jsonResponse({ behind: [] });
      }
      if (url === "/api/deploy/bulk") {
        return jsonResponse(bulkReport);
      }
      if (url === "/api/deploy") {
        return jsonResponse({
          deployed: { type: "skill", name: "review", version: "v1.0.0" },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
}

// The dialog's control shares the bar's name, so it is found inside the dialog.
async function openDialog() {
  await userEvent.click(screen.getByRole("button", { name: "Deploy skills" }));
  return screen.getByRole("dialog");
}

async function deploy() {
  const dialog = await openDialog();
  const button = within(dialog).getByRole("button", {
    name: /deploy skills?|loading targets/i,
  });
  await vi.waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  return dialog;
}

describe("BulkDeployAction", () => {
  it("deploys the staged skills to the chosen target and reports the result", async () => {
    stubReads({
      target: { kind: "global" },
      deployed: [
        { name: "tdd", version: "v1.0.0" },
        { name: "review", version: "v1.0.0" },
      ],
      attention: [],
      failed: [],
    });
    renderWithQuery(
      <BulkDeployAction
        stagedNames={["tdd", "review"]}
        repos={[]}
        registryReady
      />,
    );

    await deploy();

    expect(
      await screen.findByRole("heading", { name: /2 deployed/ }),
    ).toBeVisible();
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === "/api/deploy/bulk",
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      names: ["tdd", "review"],
      target: { kind: "global" },
    });
  });

  it("reinstalls a diverged attention skill on its own row's receipt", async () => {
    stubReads({
      target: { kind: "global" },
      deployed: [{ name: "tdd", version: "v1.0.0" }],
      attention: [
        {
          name: "review",
          error: "deployed-diverged-from-lock",
          forceable: true,
          copyReceipt:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ],
      failed: [],
    });
    renderWithQuery(
      <BulkDeployAction
        stagedNames={["tdd", "review"]}
        repos={[]}
        registryReady
      />,
    );

    await deploy();
    await userEvent.click(
      await screen.findByRole("button", { name: /deploy review again/i }),
    );

    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const forceCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/deploy",
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(forceCall[1].body as string)).toEqual({
      type: "skill",
      name: "review",
      target: { kind: "global" },
      confirmedCopyReceipt:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });
  });

  it("states a refused reinstall in the dialog, from the deploy notice table", async () => {
    stubReads({
      target: { kind: "global" },
      deployed: [],
      attention: [
        {
          name: "review",
          error: "deployed-diverged-from-lock",
          forceable: true,
          copyReceipt: "b".repeat(64),
        },
      ],
      failed: [],
    });
    const reads = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
        String(input) === "/api/deploy"
          ? jsonResponse({ error: "deploy-in-progress" }, 409)
          : reads(input, init),
      ),
    );
    renderWithQuery(
      <BulkDeployAction stagedNames={["review"]} repos={[]} registryReady />,
    );

    const dialog = await deploy();
    await userEvent.click(
      await within(dialog).findByRole("button", {
        name: /deploy review again/i,
      }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Another change is running",
    );
  });

  it("keeps the deploy button disabled until the chosen target's state has loaded", async () => {
    // This target's deploy-state read never resolves: the registry is ready, its
    // clean/behind data is not.
    let resolveDeployState: (() => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state?repo=")) {
          await new Promise<void>((resolve) => {
            resolveDeployState = resolve;
          });
          return jsonResponse({ primitives: [], skipped: [] });
        }
        if (url.startsWith("/api/drift?repo=")) {
          return jsonResponse({ behind: [] });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderWithQuery(
      <BulkDeployAction
        stagedNames={["tdd"]}
        repos={[{ path: "/repo" }]}
        registryReady
      />,
    );

    const dialog = await openDialog();
    const button = within(dialog).getByRole("button", {
      name: "Deploy skill",
    });
    expect(button).toBeDisabled();

    resolveDeployState?.();
    await vi.waitFor(() => expect(button).not.toBeDisabled());
  });

  it("still sends a skill missing from one detected tool during a global run", async () => {
    // tdd is up to date on Claude Code but never installed on Codex; a global run
    // must still reach Codex (#292).
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state/global")) {
          return jsonResponse({
            tools: [
              {
                tool: "claude",
                primitives: [{ type: "skill", name: "tdd", version: "v1.0.0" }],
              },
              { tool: "codex", primitives: [] },
            ],
            skipped: [],
          });
        }
        if (url.startsWith("/api/drift/global")) {
          return jsonResponse({ behind: [] });
        }
        if (url === "/api/deploy/bulk") {
          expect(JSON.parse(init?.body as string)).toEqual({
            names: ["tdd"],
            target: { kind: "global" },
          });
          return jsonResponse({
            target: { kind: "global" },
            deployed: [{ name: "tdd", version: "v1.0.0" }],
            attention: [],
            failed: [],
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderWithQuery(
      <BulkDeployAction stagedNames={["tdd"]} repos={[]} registryReady />,
    );

    await deploy();

    expect(
      await screen.findByRole("heading", { name: /1 deployed/ }),
    ).toBeVisible();
  });

  it("names a repo target by its shortened label, never its absolute path", async () => {
    // An absolute path pushes the outcome off its row (#211).
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state?repo=")) {
          return jsonResponse({ primitives: [], skipped: [] });
        }
        if (url.startsWith("/api/drift?repo=")) {
          return jsonResponse({ behind: [] });
        }
        if (url === "/api/deploy/bulk") {
          return jsonResponse({
            target: { kind: "repo", repoPath: "/Users/m/Projects/maestro" },
            deployed: [{ name: "tdd", version: "v1.0.0" }],
            attention: [],
            failed: [],
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderWithQuery(
      <BulkDeployAction
        stagedNames={["tdd"]}
        repos={[{ path: "/Users/m/Projects/maestro" }]}
        registryReady
      />,
    );

    await deploy();

    const heading = await screen.findByRole("heading", { level: 3 });
    expect(heading).toHaveTextContent("…/Projects/maestro");
    expect(heading).not.toHaveTextContent("/Users/m/Projects/maestro");
  });

  it("lists repo options by their shortened label, never their absolute path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state?repo=")) {
          return jsonResponse({ primitives: [], skipped: [] });
        }
        if (url.startsWith("/api/drift?repo=")) {
          return jsonResponse({ behind: [] });
        }
        if (url.startsWith("/api/deploy-state/global")) {
          return jsonResponse({ tools: [], skipped: [] });
        }
        if (url.startsWith("/api/drift/global")) {
          return jsonResponse({ behind: [] });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderWithQuery(
      <BulkDeployAction
        stagedNames={["tdd"]}
        repos={[
          { path: "/Users/m/Projects/maestro" },
          { path: "/Users/m/Projects/agent-harness" },
        ]}
        registryReady
      />,
    );

    await openDialog();
    const option = await screen.findByRole("option", {
      name: "…/Projects/agent-harness",
    });
    // The value stays the absolute path — it is what the deploy request needs.
    expect(option).toHaveValue("/Users/m/Projects/agent-harness");
  });

  it("shows a distinct failure, never a green success, when the bulk request itself fails", async () => {
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
        if (url.startsWith("/api/drift/global")) {
          return jsonResponse({ behind: [] });
        }
        if (url === "/api/deploy/bulk") {
          return new Response(
            JSON.stringify({
              error: "deploy-failed",
              message: "Server error.",
            }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    renderWithQuery(
      <BulkDeployAction stagedNames={["tdd"]} repos={[]} registryReady />,
    );

    await deploy();

    // A Notice, never zeroed counts that would read as a clean success (#292).
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(/did not run/i);
    expect(notice).not.toHaveTextContent(/deployed/i);
    expect(notice).not.toHaveTextContent(/0 skipped/i);
  });

  it("stays open and unclosable while the deploy runs, then reads and closes", async () => {
    let answer: (() => void) | undefined;
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
        if (url.startsWith("/api/drift/global")) {
          return jsonResponse({ behind: [] });
        }
        if (url === "/api/deploy/bulk") {
          await new Promise<void>((resolve) => {
            answer = resolve;
          });
          return jsonResponse({
            target: { kind: "global" },
            deployed: [{ name: "tdd", version: "v1.0.0" }],
            attention: [],
            failed: [],
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    renderWithQuery(
      <BulkDeployAction stagedNames={["tdd"]} repos={[]} registryReady />,
    );

    const dialog = await deploy();

    expect(
      within(dialog).getByRole("button", { name: "Deploying…" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    answer?.();
    expect(
      await within(dialog).findByRole("heading", { name: /1 deployed/ }),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Close" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports a partial run worst group first, a failed install as one row for every name", async () => {
    // One install carries the batch, so an install failure fails every name in it.
    stubReads({
      target: { kind: "global" },
      deployed: [{ name: "grilling", version: "v1.0.0" }],
      attention: [
        {
          name: "review",
          error: "deployed-diverged-from-lock",
          forceable: true,
          copyReceipt:
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ],
      failed: [{ error: "deploy-failed", names: ["tdd", "caveman"] }],
    });
    renderWithQuery(
      <BulkDeployAction
        stagedNames={["tdd", "caveman", "review", "grilling"]}
        repos={[]}
        registryReady
      />,
    );

    const dialog = await deploy();

    await within(dialog).findByRole("heading", { level: 3 });
    const groups = within(dialog).getAllByRole("heading", { level: 4 });
    expect(groups.map((group) => group.textContent)).toEqual([
      "✕Failed2",
      "⚠Attention1",
      "✓Deployed1",
    ]);
    expect(within(dialog).getByText("tdd, caveman")).toBeVisible();
  });
});

// The Inventory pane's Deploy skill opens this dialog with one skill staged.
describe("BulkDeployAction — the target it deploys to", () => {
  const twoRepos = [{ path: "/projects/alpha" }, { path: "/projects/beta" }];

  function stubTools(tools: { tool: string; primitives: unknown[] }[]) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy-state/global")) {
        return jsonResponse({ tools, skipped: [] });
      }
      if (url.startsWith("/api/drift")) {
        return jsonResponse({ behind: [] });
      }
      if (url.startsWith("/api/deploy-state")) {
        return jsonResponse({ primitives: [], skipped: [] });
      }
      return jsonResponse({
        target: { kind: "global" },
        deployed: [{ name: "tdd", version: "v1.0.0" }],
        attention: [],
        failed: [],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  const openOne = async (repos: { path: string }[]) => {
    renderWithQuery(
      <BulkDeployAction stagedNames={["tdd"]} repos={repos} registryReady />,
    );
    return openDialog();
  };

  const sentTarget = (fetchMock: ReturnType<typeof vi.fn>) => {
    const call = fetchMock.mock.calls.find(
      ([url]) => url === "/api/deploy/bulk",
    ) as unknown as [string, RequestInit];
    return JSON.parse(call[1].body as string).target;
  };

  it("confirms one skill with the singular verb and object", async () => {
    stubTools([{ tool: "claude", primitives: [] }]);
    const dialog = await openOne([]);

    expect(
      within(dialog).getByRole("heading", { name: "Deploy 1 skill" }),
    ).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Deploy skill" }),
      ).toBeEnabled(),
    );
  });

  it("offers Global as the first target option", async () => {
    stubTools([{ tool: "claude", primitives: [] }]);
    const dialog = await openOne(twoRepos);

    const options = within(
      within(dialog).getByRole("combobox", { name: "Target" }),
    ).getAllByRole("option");
    expect(options[0]).toHaveTextContent("Global");
  });

  // #134: the Global option says where it lands before anything runs.
  it("names the tools the Global option will hit on a two-tool machine", async () => {
    stubTools([
      { tool: "claude", primitives: [] },
      { tool: "codex", primitives: [] },
    ]);
    const dialog = await openOne(twoRepos);

    expect(
      await within(dialog).findByRole("option", {
        name: /Global \(Claude Code \+ Codex\)/,
      }),
    ).toBeEnabled();
  });

  it("names the single tool the Global option will hit on a one-tool machine", async () => {
    stubTools([{ tool: "claude", primitives: [] }]);
    const dialog = await openOne(twoRepos);

    expect(
      await within(dialog).findByRole("option", {
        name: /Global \(Claude Code\)/,
      }),
    ).toBeInTheDocument();
  });

  it("disables the Global option and the deploy when no tool is detected", async () => {
    stubTools([]);
    const dialog = await openOne([]);

    expect(
      await within(dialog).findByRole("option", {
        name: /Global \(no tool detected\)/,
      }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: /^Deploy skill|Loading/ }),
    ).toBeDisabled();
  });

  // Global needs no repo, so a deploy never waits on a registration.
  it("deploys globally when no repo is registered", async () => {
    const fetchMock = stubTools([{ tool: "claude", primitives: [] }]);
    await openOne([]);
    const dialog = screen.getByRole("dialog");
    const run = within(dialog).getByRole("button", { name: /^Deploy skill/ });
    await vi.waitFor(() => expect(run).toBeEnabled());
    await userEvent.click(run);

    await vi.waitFor(() =>
      expect(sentTarget(fetchMock)).toEqual({ kind: "global" }),
    );
  });

  it("deploys globally when Global is chosen even with repos present", async () => {
    const fetchMock = stubTools([{ tool: "claude", primitives: [] }]);
    const dialog = await openOne(twoRepos);
    await userEvent.selectOptions(
      within(dialog).getByRole("combobox", { name: "Target" }),
      "global",
    );
    const run = within(dialog).getByRole("button", { name: /^Deploy skill/ });
    await vi.waitFor(() => expect(run).toBeEnabled());
    await userEvent.click(run);

    await vi.waitFor(() =>
      expect(sentTarget(fetchMock)).toEqual({ kind: "global" }),
    );
  });

  // #48: a deploy refetches the target's deploy-state and its drift, or a
  // badge outlives the change that made it wrong.
  it("re-reads the chosen target's deploy-state and drift after a deploy", async () => {
    const fetchMock = stubTools([{ tool: "claude", primitives: [] }]);
    const dialog = await openOne([{ path: "/projects/alpha" }]);
    const run = within(dialog).getByRole("button", { name: /^Deploy skill/ });
    await vi.waitFor(() => expect(run).toBeEnabled());
    const reads = (prefix: string) =>
      fetchMock.mock.calls.filter(([url]) => String(url).startsWith(prefix))
        .length;
    const before = {
      state: reads("/api/deploy-state?repo="),
      drift: reads("/api/drift?repo="),
    };
    await userEvent.click(run);

    await vi.waitFor(() => {
      expect(reads("/api/deploy-state?repo=")).toBeGreaterThan(before.state);
      expect(reads("/api/drift?repo=")).toBeGreaterThan(before.drift);
    });
  });
});
