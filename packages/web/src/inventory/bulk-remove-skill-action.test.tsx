import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployStatePanel } from "../deploy-state/deploy-state-panel";
import { BulkRemoveSkillAction } from "./bulk-remove-skill-action";
import type { DeployTarget } from "./use-deploy-skill";

afterEach(() => {
  vi.unstubAllGlobals();
});

const TARGETS: DeployTarget[] = [
  { kind: "global" },
  { kind: "repo", repoPath: "/dev/acme-web" },
];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const preflightAnswer = {
  check: { scope: "repo", warning: null },
  reclaim: null,
};

const emptyReport = { name: "tdd", removed: [], refused: [], failed: [] };

// One mock for both routes: the preflight answers, the bulk run reports.
function stubServer(overrides: { preflight?: () => Response } = {}) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      body: init?.body === undefined ? null : JSON.parse(String(init.body)),
    });
    if (url.endsWith("/remove/preflight")) {
      return overrides.preflight?.() ?? jsonResponse(preflightAnswer);
    }
    return jsonResponse(emptyReport);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderAction(targets = TARGETS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <BulkRemoveSkillAction skillName="tdd" targets={targets} />
    </QueryClientProvider>,
  );
}

const openDialog = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: "remove from all 2 →" }),
  );
};

describe("BulkRemoveSkillAction", () => {
  it("checks every target the moment the dialog opens", async () => {
    const calls = stubServer();
    renderAction();

    await openDialog();

    await waitFor(() => {
      const preflights = calls.filter((call) =>
        call.url.endsWith("/remove/preflight"),
      );
      expect(preflights.map((call) => call.body)).toEqual([
        { type: "skill", name: "tdd", target: TARGETS[0] },
        { type: "skill", name: "tdd", target: TARGETS[1] },
      ]);
    });
  });

  it("sends one request for the whole run, and closes when it finishes", async () => {
    const calls = stubServer();
    renderAction();
    await openDialog();

    const confirm = await screen.findByRole("button", {
      name: "remove from 2 →",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const runs = calls.filter((call) => call.url.endsWith("/remove/bulk"));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.body).toEqual({
      name: "tdd",
      targets: [{ target: TARGETS[0] }, { target: TARGETS[1] }],
    });
  });

  it("takes a target its own check refused out of the run rather than guessing", async () => {
    // A refusal is an answer: the server already said this target cannot be
    // removed, so the run is told rather than left to rediscover it.
    const calls = stubServer({
      preflight: () =>
        jsonResponse(
          { error: "repo-not-registered", message: "Not registered." },
          404,
        ),
    });
    renderAction();
    await openDialog();

    const confirm = await screen.findByRole("button", {
      name: "remove from 2 →",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() => {
      const runs = calls.filter((call) => call.url.endsWith("/remove/bulk"));
      expect(runs[0]?.body).toEqual({
        name: "tdd",
        targets: [
          { target: TARGETS[0], refused: "repo-not-registered" },
          { target: TARGETS[1], refused: "repo-not-registered" },
        ],
      });
    });
  });

  it("refreshes the targets it removed from, so what still shows still needs removing", async () => {
    // The pane and the inventory's deployed column read the same queries; a
    // stale one would keep listing a copy that is gone (frontend.md).
    let removed = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state")) {
          return jsonResponse({
            primitives: removed
              ? []
              : [{ type: "skill", name: "tdd", version: "v1.0.0" }],
            skipped: [],
          });
        }
        if (url.endsWith("/remove/preflight")) {
          return jsonResponse(preflightAnswer);
        }
        removed = true;
        return jsonResponse(emptyReport);
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <BulkRemoveSkillAction
          skillName="tdd"
          targets={[{ kind: "repo", repoPath: "/dev/acme-web" }]}
        />
        <DeployStatePanel repo="/dev/acme-web" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("v1.0.0")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "remove from all 1 →" }),
    );
    const confirm = await screen.findByRole("button", {
      name: "remove from 1 →",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    expect(await screen.findByText(/empty/i)).toBeInTheDocument();
  });

  it("re-checks from scratch on reopen, never confirming against the last open's answer", async () => {
    // A copy can pick up local edits between two opens; an answer kept from
    // the first would hand out a confirm against a cost nobody has measured
    // (#337). The second check here never answers, so a live confirm can only
    // mean the first answer was reused.
    let preflights = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (!String(input).endsWith("/remove/preflight")) {
          return jsonResponse(emptyReport);
        }
        preflights += 1;
        return preflights === 1
          ? jsonResponse(preflightAnswer)
          : new Promise<Response>(() => {});
      }),
    );
    renderAction([{ kind: "repo", repoPath: "/dev/acme-web" }]);
    const openIt = async () =>
      userEvent.click(
        screen.getByRole("button", { name: "remove from all 1 →" }),
      );

    await openIt();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "remove from 1 →" }),
      ).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "cancel" }));
    await openIt();

    expect(
      screen.getByRole("button", { name: "remove from 1 →" }),
    ).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "checking 1 targets — 0 answered",
    );
  });
});
