import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { BulkDeployBar } from "./bulk-deploy-bar";

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

describe("BulkDeployBar", () => {
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
      <BulkDeployBar
        stagedNames={["tdd", "review"]}
        hiddenCount={0}
        repos={[]}
        registryReady
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /deploy 2/i }),
    );

    expect(
      await screen.findByRole("status", { name: /bulk deploy result/i }),
    ).toHaveTextContent(/2 deployed/);
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === "/api/deploy/bulk",
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      names: ["tdd", "review"],
      target: { kind: "global" },
    });
  });

  it("force-reinstalls a diverged attention skill on its own", async () => {
    stubReads({
      target: { kind: "global" },
      deployed: [{ name: "tdd", version: "v1.0.0" }],
      attention: [
        {
          name: "review",
          error: "deployed-diverged-from-lock",
          forceable: true,
        },
      ],
      failed: [],
    });
    renderWithQuery(
      <BulkDeployBar
        stagedNames={["tdd", "review"]}
        hiddenCount={0}
        repos={[]}
        registryReady
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /deploy 2/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /reinstall fresh review/i }),
    );

    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const forceCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/deploy",
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(forceCall[1].body as string)).toEqual({
      type: "skill",
      name: "review",
      target: { kind: "global" },
      force: true,
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
      <BulkDeployBar
        stagedNames={["tdd"]}
        hiddenCount={0}
        repos={[{ path: "/repo" }]}
        registryReady
      />,
    );

    const button = await screen.findByRole("button", { name: /deploy 1/i });
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
      <BulkDeployBar
        stagedNames={["tdd"]}
        hiddenCount={0}
        repos={[]}
        registryReady
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /deploy 1/i }),
    );

    expect(
      await screen.findByRole("status", { name: /bulk deploy result/i }),
    ).toHaveTextContent(/1 deployed/);
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
      <BulkDeployBar
        stagedNames={["tdd"]}
        hiddenCount={0}
        repos={[{ path: "/Users/m/Projects/maestro" }]}
        registryReady
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /deploy 1/i }),
    );

    const status = await screen.findByRole("status", {
      name: /bulk deploy result/i,
    });
    expect(status).toHaveTextContent("…/Projects/maestro");
    expect(status).not.toHaveTextContent("/Users/m/Projects/maestro");
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
      <BulkDeployBar
        stagedNames={["tdd"]}
        hiddenCount={0}
        repos={[
          { path: "/Users/m/Projects/maestro" },
          { path: "/Users/m/Projects/agent-harness" },
        ]}
        registryReady
      />,
    );

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
      <BulkDeployBar
        stagedNames={["tdd"]}
        hiddenCount={0}
        repos={[]}
        registryReady
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /deploy 1/i }),
    );

    const status = await screen.findByRole("status", {
      name: /bulk deploy result/i,
    });
    expect(status).toHaveTextContent(/failed/i);
    expect(status).not.toHaveTextContent(/deployed/i);
    expect(status).not.toHaveTextContent(/0 skipped/i);
  });
});
