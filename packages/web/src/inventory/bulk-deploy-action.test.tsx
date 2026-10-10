import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseDeployTarget,
  jsonResponse,
  renderWithQuery,
} from "../test-utils";
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

const runnable = (dialog: HTMLElement) =>
  within(dialog).findByRole("button", { name: /^Deploy skills?$/ });

async function deploy(target: string | RegExp = /^Global/) {
  const dialog = await openDialog();
  await chooseDeployTarget(dialog, target);
  await userEvent.click(await runnable(dialog));
  return dialog;
}

// The cockpit's Select lists its options in a popover outside the dialog.
async function openTargets(dialog: HTMLElement) {
  await userEvent.click(
    within(dialog).getByRole("combobox", { name: "Target" }),
  );
  return screen.findAllByRole("option");
}

// The ✕ in the header and the footer's leave control share the name.
const footerClose = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("button", { name: "Close" })
    .at(-1) as HTMLElement;

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
        onSelectionSpent={() => {}}
      />,
    );

    await deploy();

    expect(
      await screen.findByRole("heading", {
        name: "Deployed 2 of 2 skills to Global",
      }),
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
        onSelectionSpent={() => {}}
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
      <BulkDeployAction
        stagedNames={["review"]}
        repos={[]}
        registryReady
        onSelectionSpent={() => {}}
      />,
    );

    const dialog = await deploy();
    await userEvent.click(
      await within(dialog).findByRole("button", {
        name: /deploy review again/i,
      }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Target busy",
    );
  });

  it("holds Deploy again busy and the dialog open while it runs, so a second press sends nothing", async () => {
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
    let answer: (() => void) | undefined;
    const deployCalls = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) !== "/api/deploy") return reads(input, init);
        deployCalls();
        await new Promise<void>((resolve) => {
          answer = resolve;
        });
        return reads(input, init);
      }),
    );
    renderWithQuery(
      <BulkDeployAction
        stagedNames={["review"]}
        repos={[]}
        registryReady
        onSelectionSpent={() => {}}
      />,
    );

    const dialog = await deploy();
    const again = await within(dialog).findByRole("button", {
      name: /deploy review again/i,
    });
    await userEvent.click(again);

    expect(again).toHaveAccessibleName("Deploying…");
    expect(again).toHaveAttribute("aria-busy", "true");
    expect(again).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(again);
    expect(deployCalls).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    answer?.();
    await vi.waitFor(() =>
      expect(again).toHaveAccessibleName("Deploy review again"),
    );
    expect(again).not.toHaveAttribute("aria-disabled");
  });

  it("names why it cannot deploy while the registry has not answered", async () => {
    stubReads({});
    renderWithQuery(
      <BulkDeployAction
        stagedNames={["tdd"]}
        repos={[]}
        registryReady={false}
        onSelectionSpent={() => {}}
      />,
    );

    const dialog = await openDialog();

    expect(
      within(dialog).getByRole("button", {
        name: "Deploy skill — targets still loading",
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("keeps the deploy unavailable until the chosen target's state has loaded", async () => {
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
        onSelectionSpent={() => {}}
      />,
    );

    const dialog = await openDialog();
    await chooseDeployTarget(dialog, /repo$/);
    expect(
      within(dialog).getByRole("button", {
        name: "Deploy skill — targets still loading",
      }),
    ).toHaveAttribute("aria-disabled", "true");

    resolveDeployState?.();
    expect(await runnable(dialog)).not.toHaveAttribute("aria-disabled");
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
      <BulkDeployAction
        stagedNames={["tdd"]}
        repos={[]}
        registryReady
        onSelectionSpent={() => {}}
      />,
    );

    await deploy();

    expect(
      await screen.findByRole("heading", {
        name: "Deployed 1 of 1 skill to Global",
      }),
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
        onSelectionSpent={() => {}}
      />,
    );

    await deploy(/Projects\/maestro$/);

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
        if (url === "/api/deploy/bulk") {
          return jsonResponse({
            target: {
              kind: "repo",
              repoPath: "/Users/m/Projects/agent-harness",
            },
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
        repos={[
          { path: "/Users/m/Projects/maestro" },
          { path: "/Users/m/Projects/agent-harness" },
        ]}
        registryReady
        onSelectionSpent={() => {}}
      />,
    );

    const dialog = await openDialog();
    await chooseDeployTarget(dialog, "…/Projects/agent-harness");
    await userEvent.click(await runnable(dialog));

    // The request still names the absolute path — it is what the deploy needs.
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    await vi.waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => url === "/api/deploy/bulk"),
      ).toBe(true),
    );
    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === "/api/deploy/bulk",
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string).target).toEqual({
      kind: "repo",
      repoPath: "/Users/m/Projects/agent-harness",
    });
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
      <BulkDeployAction
        stagedNames={["tdd"]}
        repos={[]}
        registryReady
        onSelectionSpent={() => {}}
      />,
    );

    await deploy();

    // A Notice, never zeroed counts that would read as a clean success (#292).
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(/did not run/i);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog)
        .getByRole("combobox", { name: "Target" })
        .compareDocumentPosition(notice),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      notice.compareDocumentPosition(
        within(dialog).getByRole("button", { name: "Deploy skill" }),
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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
      <BulkDeployAction
        stagedNames={["tdd"]}
        repos={[]}
        registryReady
        onSelectionSpent={() => {}}
      />,
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
      await within(dialog).findByRole("heading", {
        name: "Deployed 1 of 1 skill to Global",
      }),
    ).toBeVisible();
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons.at(-1)).toBe(footerClose(dialog));
    expect(
      within(dialog).queryByRole("button", { name: /^Deploy skill|Cancel/ }),
    ).toBeNull();
    await userEvent.click(footerClose(dialog));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("spending the selection", () => {
    const report = {
      target: { kind: "global" },
      deployed: [{ name: "tdd", version: "v1.0.0" }],
      attention: [],
      failed: [],
    };

    function renderSpending() {
      const onSelectionSpent = vi.fn();
      renderWithQuery(
        <BulkDeployAction
          stagedNames={["tdd"]}
          repos={[]}
          registryReady
          onSelectionSpent={onSelectionSpent}
        />,
      );
      return onSelectionSpent;
    }

    it("spends the selection once the Report closes, never while it is open", async () => {
      stubReads(report);
      const onSelectionSpent = renderSpending();

      const dialog = await deploy();
      await within(dialog).findByRole("heading", {
        name: "Deployed 1 of 1 skill to Global",
      });
      expect(onSelectionSpent).not.toHaveBeenCalled();

      await userEvent.click(footerClose(dialog));
      expect(onSelectionSpent).toHaveBeenCalled();
    });

    it("spends the selection after a partial run, whose Report holds the recovery", async () => {
      stubReads({
        ...report,
        deployed: [],
        failed: [{ error: "deploy-failed", names: ["tdd"] }],
      });
      const onSelectionSpent = renderSpending();

      const dialog = await deploy();
      await within(dialog).findByRole("heading", { level: 3 });
      await userEvent.click(footerClose(dialog));

      expect(onSelectionSpent).toHaveBeenCalled();
    });

    it("keeps the selection when the dialog closes before a deploy", async () => {
      stubReads(report);
      const onSelectionSpent = renderSpending();

      const dialog = await openDialog();
      await userEvent.click(
        within(dialog).getByRole("button", { name: "Cancel" }),
      );

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(onSelectionSpent).not.toHaveBeenCalled();
    });

    it("keeps the selection when the bulk request did not run", async () => {
      stubReads(report);
      const reads = fetch;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
          String(input) === "/api/deploy/bulk"
            ? jsonResponse({ error: "deploy-failed" }, 500)
            : reads(input, init),
        ),
      );
      const onSelectionSpent = renderSpending();

      const dialog = await deploy();
      await within(dialog).findByRole("alert");
      await userEvent.keyboard("{Escape}");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(onSelectionSpent).not.toHaveBeenCalled();
    });
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
        onSelectionSpent={() => {}}
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
      <BulkDeployAction
        stagedNames={["tdd"]}
        repos={repos}
        registryReady
        onSelectionSpent={() => {}}
      />,
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
    await chooseDeployTarget(dialog, /^Global/);

    expect(
      within(dialog).getByRole("heading", { name: "Deploy 1 skill" }),
    ).toBeInTheDocument();
    expect(await runnable(dialog)).toHaveTextContent("Deploy skill");
  });

  it("offers Global as the first target option", async () => {
    stubTools([{ tool: "claude", primitives: [] }]);
    const dialog = await openOne(twoRepos);

    const options = await openTargets(dialog);
    expect(options[0]).toHaveTextContent("Global");
  });

  // #134: the Global option says where it lands before anything runs.
  it("names the tools the Global option will hit on a two-tool machine", async () => {
    stubTools([
      { tool: "claude", primitives: [] },
      { tool: "codex", primitives: [] },
    ]);
    const dialog = await openOne(twoRepos);
    await openTargets(dialog);

    expect(
      await screen.findByRole("option", {
        name: /Global \(Claude Code \+ Codex\)/,
      }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("names the single tool the Global option will hit on a one-tool machine", async () => {
    stubTools([{ tool: "claude", primitives: [] }]);
    const dialog = await openOne(twoRepos);
    await openTargets(dialog);

    expect(
      await screen.findByRole("option", {
        name: /Global \(Claude Code\)/,
      }),
    ).toBeInTheDocument();
  });

  it("disables the Global option, and the deploy waits for a target, when no tool is detected", async () => {
    stubTools([]);
    const dialog = await openOne([]);

    expect(
      within(dialog).getByRole("button", {
        name: "Deploy skill — no target",
      }),
    ).toHaveAttribute("aria-disabled", "true");
    await openTargets(dialog);
    expect(
      await screen.findByRole("option", {
        name: /Global \(no tool detected\)/,
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("names why the deploy cannot run when the chosen Global loses its last tool", async () => {
    let tools = [{ tool: "claude", primitives: [] as unknown[] }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state/global")) {
          return jsonResponse({ tools, skipped: [] });
        }
        return jsonResponse({ behind: [] });
      }),
    );
    const { queryClient } = renderWithQuery(
      <BulkDeployAction
        stagedNames={["tdd"]}
        repos={[]}
        registryReady
        onSelectionSpent={() => {}}
      />,
    );
    const dialog = await openDialog();
    await chooseDeployTarget(dialog, /^Global/);
    expect(await runnable(dialog)).not.toHaveAttribute("aria-disabled");

    tools = [];
    await queryClient.invalidateQueries();

    expect(
      await within(dialog).findByRole("button", {
        name: "Deploy skill — no tool detected",
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  // Global needs no repo, so a deploy never waits on a registration.
  it("deploys globally when no repo is registered", async () => {
    const fetchMock = stubTools([{ tool: "claude", primitives: [] }]);
    const dialog = await openOne([]);
    await chooseDeployTarget(dialog, /^Global/);
    await userEvent.click(await runnable(dialog));

    await vi.waitFor(() =>
      expect(sentTarget(fetchMock)).toEqual({ kind: "global" }),
    );
  });

  it("deploys globally when Global is chosen even with repos present", async () => {
    const fetchMock = stubTools([{ tool: "claude", primitives: [] }]);
    const dialog = await openOne(twoRepos);
    await chooseDeployTarget(dialog, /^Global/);
    await userEvent.click(await runnable(dialog));

    await vi.waitFor(() =>
      expect(sentTarget(fetchMock)).toEqual({ kind: "global" }),
    );
  });

  // #48: a deploy refetches the target's deploy-state and its drift, or a
  // badge outlives the change that made it wrong.
  it("re-reads the chosen target's deploy-state and drift after a deploy", async () => {
    const fetchMock = stubTools([{ tool: "claude", primitives: [] }]);
    const dialog = await openOne([{ path: "/projects/alpha" }]);
    await chooseDeployTarget(dialog, /projects\/alpha$/);
    const run = await runnable(dialog);
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

// #1437: the reader chooses the target, and sees what the deploy will do.
describe("BulkDeployAction — no target until the reader chooses", () => {
  const twoRepos = [{ path: "/projects/alpha" }, { path: "/projects/beta" }];

  const skill = (name: string) => ({
    type: "skill",
    name,
    version: "v1.0.0",
  });
  const behindEntry = (name: string) => ({
    name,
    current: "v1.0.0",
    latest: "v1.2.0",
    reading: "older-tag",
  });

  // Each tool and each repository holds the skills named for it; `behind` names
  // the skills every target reads as lagging.
  function stubWorld(
    world: {
      tools?: Record<string, string[]>;
      repos?: Record<string, string[]>;
      behind?: string[];
      repoStateFails?: boolean;
      repoStateHangs?: boolean;
      unverifiedDrift?: boolean;
    } = {},
  ) {
    const { tools = { claude: [] }, repos = {}, behind = [] } = world;
    const lagging = { behind: behind.map(behindEntry) };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy-state/global")) {
        return jsonResponse({
          tools: Object.entries(tools).map(([tool, names]) => ({
            tool,
            primitives: names.map(skill),
          })),
          skipped: [],
        });
      }
      if (url.startsWith("/api/drift")) {
        return jsonResponse(
          world.unverifiedDrift ? { ok: false, reason: "unverified" } : lagging,
        );
      }
      if (url.startsWith("/api/deploy-state?repo=")) {
        if (world.repoStateHangs) {
          return new Promise<Response>(() => undefined);
        }
        if (world.repoStateFails) {
          throw new Error("read failed");
        }
        const path = decodeURIComponent(url.split("repo=")[1] ?? "");
        return jsonResponse({
          primitives: (repos[path] ?? []).map(skill),
          skipped: [],
        });
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

  const open = async (repos: { path: string }[], stagedNames: string[]) => {
    renderWithQuery(
      <BulkDeployAction
        stagedNames={stagedNames}
        repos={repos}
        registryReady
        onSelectionSpent={() => {}}
      />,
    );
    return openDialog();
  };

  it("opens with no target, reads no repository and sends nothing", async () => {
    const fetchMock = stubWorld();
    const dialog = await open(twoRepos, ["tdd"]);

    expect(
      within(dialog).getByRole("combobox", { name: "Target" }),
    ).toHaveTextContent("Choose a target");
    const deployButton = within(dialog).getByRole("button", {
      name: "Deploy skill — no target",
    });
    expect(deployButton).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(deployButton);

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.startsWith("/api/deploy-state?repo="))).toBe(
      false,
    );
    expect(urls.some((url) => url.startsWith("/api/drift?repo="))).toBe(false);
    expect(urls).not.toContain("/api/deploy/bulk");
  });

  it("offers the deploy once a target is chosen and its state has loaded", async () => {
    stubWorld();
    const dialog = await open(twoRepos, ["tdd"]);

    await chooseDeployTarget(dialog, /projects\/beta$/);

    expect(await runnable(dialog)).not.toHaveAttribute("aria-disabled");
  });

  it("does not choose Global for the reader when it is the only target", async () => {
    stubWorld();
    const dialog = await open([], ["tdd"]);

    expect(
      within(dialog).getByRole("combobox", { name: "Target" }),
    ).toHaveTextContent("Choose a target");
    expect(
      within(dialog).getByRole("button", {
        name: "Deploy skill — no target",
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  const groupNamed = (dialog: HTMLElement, name: string) =>
    within(dialog).getByRole("group", { name });

  it("lists the staged skills with no reading before a target is chosen", async () => {
    stubWorld();
    const dialog = await open(twoRepos, ["tdd", "review", "grilling"]);

    for (const name of ["tdd", "review", "grilling"]) {
      expect(within(dialog).getByText(name)).toBeVisible();
    }
    expect(
      within(dialog).queryByRole("group", {
        name: /^(To deploy|Already up to date)/,
      }),
    ).not.toBeInTheDocument();
  });

  it("splits the list into what is deployed and what stays, by the chosen target", async () => {
    stubWorld({
      tools: { claude: ["tdd", "review"] },
      behind: ["review"],
    });
    const dialog = await open([], ["tdd", "review", "grilling"]);

    await chooseDeployTarget(dialog, /^Global/);

    const stays = await within(dialog).findByRole("group", {
      name: "Already up to date · 1",
    });
    expect(within(stays).getByText("tdd")).toBeVisible();
    expect(within(stays).getByText("Deploy skips these skills.")).toBeVisible();
    const changes = groupNamed(dialog, "To deploy · 2");
    expect(within(changes).getByText("review")).toBeVisible();
    expect(within(changes).getByText("grilling")).toBeVisible();
  });

  it("sends exactly the skills the dialog listed as to deploy", async () => {
    const fetchMock = stubWorld({
      tools: { claude: ["tdd", "review"] },
      behind: ["review"],
    });
    const dialog = await open([], ["tdd", "review", "grilling"]);
    await chooseDeployTarget(dialog, /^Global/);
    await within(dialog).findByRole("group", { name: "To deploy · 2" });

    await userEvent.click(await runnable(dialog));

    await vi.waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url]) => url === "/api/deploy/bulk",
      ) as unknown as [string, RequestInit];
      expect(JSON.parse(call[1].body as string).names).toEqual([
        "review",
        "grilling",
      ]);
    });
  });

  it("marks nothing when the drift check could not verify the target", async () => {
    stubWorld({ tools: { claude: ["tdd"] }, unverifiedDrift: true });
    const dialog = await open([], ["tdd"]);

    await chooseDeployTarget(dialog, /^Global/);

    expect(
      await within(dialog).findByRole("group", { name: "To deploy · 1" }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole("group", { name: /^Already up to date/ }),
    ).not.toBeInTheDocument();
  });

  it("marks nothing while the chosen target's state is still loading", async () => {
    stubWorld({ repoStateHangs: true });
    const dialog = await open(twoRepos, ["tdd"]);

    await chooseDeployTarget(dialog, /projects\/alpha$/);

    expect(
      within(dialog).getByRole("button", {
        name: "Deploy skill — targets still loading",
      }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(dialog).queryByRole("group", {
        name: /^(To deploy|Already up to date)/,
      }),
    ).not.toBeInTheDocument();
  });

  it("marks a skill on Global only when it is up to date on every detected tool", async () => {
    stubWorld({ tools: { claude: ["tdd"], codex: [] } });
    const dialog = await open([], ["tdd"]);

    await chooseDeployTarget(dialog, /^Global/);

    expect(
      await within(dialog).findByRole("group", { name: "To deploy · 1" }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole("group", { name: /^Already up to date/ }),
    ).not.toBeInTheDocument();
  });

  it("replaces the marks with those of the next target the reader chooses", async () => {
    stubWorld({ repos: { "/projects/alpha": ["tdd"] } });
    const dialog = await open(twoRepos, ["tdd"]);

    await chooseDeployTarget(dialog, /projects\/alpha$/);
    expect(
      await within(dialog).findByRole("group", {
        name: "Already up to date · 1",
      }),
    ).toBeVisible();

    await chooseDeployTarget(dialog, /projects\/beta$/);
    expect(
      await within(dialog).findByRole("group", { name: "To deploy · 1" }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole("group", { name: /^Already up to date/ }),
    ).not.toBeInTheDocument();
  });

  it("marks nothing while the chosen target's state has not been read", async () => {
    stubWorld({ repoStateFails: true, repos: { "/projects/alpha": ["tdd"] } });
    const dialog = await open(twoRepos, ["tdd"]);

    await chooseDeployTarget(dialog, /projects\/alpha$/);

    expect(within(dialog).getByText("tdd")).toBeVisible();
    expect(
      within(dialog).queryByRole("group", {
        name: /^(To deploy|Already up to date)/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("group", { name: /^Already up to date/ }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: "Deploy skill — targets still loading",
      }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
