import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { BulkDeployAction } from "./bulk-deploy-action";

afterEach(() => {
  vi.unstubAllGlobals();
});

// A fetch stub for the cockpit's read queries plus the bulk route. Deploy-state
// reads empty (nothing deployed), drift is up-to-date, and the bulk route
// returns whatever `bulkReport` the test provides.
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

// Opens the dialog from the selection bar's control; the dialog's own control
// shares its name, so it is found inside the dialog.
async function openDialog() {
  await userEvent.click(screen.getByRole("button", { name: "Deploy skills" }));
  return screen.getByRole("dialog");
}

async function deploy() {
  const dialog = await openDialog();
  const button = within(dialog).getByRole("button", {
    name: /deploy skills|loading targets/i,
  });
  await vi.waitFor(() => expect(button).toBeEnabled());
  await userEvent.click(button);
  return dialog;
}

// Successor of the retired BulkDeployBar's test (#1042): every claim it made
// is kept here, against the dialog the selection bar opens.
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

    // The Report's own heading states the run (#1038).
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

  it("keeps the deploy button disabled until the chosen target's state has loaded", async () => {
    // The repo's deploy-state read never resolves in this test, standing in
    // for the window right after switching targets — the registry is ready,
    // but this specific target's clean/behind data is not in yet.
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
      name: "Deploy skills",
    });
    expect(button).toBeDisabled();

    resolveDeployState?.();
    await vi.waitFor(() => expect(button).not.toBeDisabled());
  });

  it("still sends a skill missing from one detected tool during a global run", async () => {
    // "tdd" is deployed and up-to-date on Claude Code but was never installed
    // on Codex (added to the machine later). A global run must still reach
    // Codex, not read the Claude Code copy as "clean everywhere" (#292).
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
    // Same shortening as the sidebar and the removal rows (#211) — an absolute
    // path pushes the outcome off the row it belongs to.
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

    // A Notice, never the counts summary: zeroed counts would read as a
    // clean success the run never proved (#292).
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
    // One install carries the batch, so an install failure fails every name it
    // carried at once (docs/apm-behavior.md § A batch install).
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
