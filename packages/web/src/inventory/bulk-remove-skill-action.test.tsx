import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployStatePanel } from "../deploy-state/deploy-state-panel";
import { BulkRemoveSkillAction } from "./bulk-remove-skill-action";
import type { BulkRemoveCandidate } from "./bulk-remove-targets";

afterEach(() => {
  vi.unstubAllGlobals();
});

const TARGETS: BulkRemoveCandidate[] = [
  { target: { kind: "global" }, label: "global", version: "v1.0.0" },
  {
    target: { kind: "repo", repoPath: "/dev/acme-web" },
    label: "/dev/acme-web",
    version: "v1.0.0",
  },
];

const ACME_WEB = TARGETS[1] as BulkRemoveCandidate;

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
function stubServer(
  overrides: { preflight?: (body: unknown) => Response } = {},
) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      body: init?.body === undefined ? null : JSON.parse(String(init.body)),
    });
    if (url.endsWith("/remove/preflight")) {
      const body =
        init?.body === undefined ? null : JSON.parse(String(init.body));
      return overrides.preflight?.(body) ?? jsonResponse(preflightAnswer);
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
        { type: "skill", name: "tdd", target: TARGETS[0]?.target },
        { type: "skill", name: "tdd", target: TARGETS[1]?.target },
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
      targets: [{ target: TARGETS[0]?.target }, { target: TARGETS[1]?.target }],
    });
  });

  it("takes a target its own check refused out of the run rather than guessing", async () => {
    // A refusal is an answer: the server already said this target cannot be
    // removed, so the run is told rather than left to rediscover it. The other
    // target still goes — one unreachable repo does not stop a good removal,
    // and the confirm counts only what it will walk (#423).
    const calls = stubServer({
      preflight: (body) =>
        (body as { target: { kind: string } }).target.kind === "repo"
          ? jsonResponse(
              { error: "repo-not-registered", message: "Not registered." },
              404,
            )
          : jsonResponse(preflightAnswer),
    });
    renderAction();
    await openDialog();

    const confirm = await screen.findByRole("button", {
      name: "remove from 1 →",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() => {
      const runs = calls.filter((call) => call.url.endsWith("/remove/bulk"));
      expect(runs[0]?.body).toEqual({
        name: "tdd",
        targets: [
          { target: TARGETS[0]?.target },
          { target: TARGETS[1]?.target, refused: "repo-not-registered" },
        ],
      });
    });
  });

  it("names what cannot be removed, in a group of its own", async () => {
    stubServer({
      preflight: (body) =>
        (body as { target: { kind: string } }).target.kind === "repo"
          ? jsonResponse(
              { error: "repo-not-registered", message: "Not registered." },
              404,
            )
          : jsonResponse(preflightAnswer),
    });
    renderAction();
    await openDialog();

    const group = await screen.findByRole("group", {
      name: "✕ CAN'T BE REMOVED · 1",
    });
    expect(group).toHaveTextContent("/dev/acme-web");
    expect(group).toHaveTextContent("repo not registered");
  });

  it("weighs a copy with local edits as a cost, naming the version it destroys", async () => {
    // The check answered: this copy carries work the removal deletes. It is a
    // row with its price on it, never part of the clean count (#423).
    stubServer({
      preflight: (body) =>
        (body as { target: { kind: string } }).target.kind === "repo"
          ? jsonResponse({
              check: { scope: "repo", warning: "local-edits-will-be-lost" },
              reclaim: null,
            })
          : jsonResponse(preflightAnswer),
    });
    renderAction();
    await openDialog();

    const group = await screen.findByRole("group", {
      name: "▲ LOSES WORK · 1",
    });
    expect(group).toHaveTextContent("/dev/acme-web");
    expect(group).toHaveTextContent("v1.0.0");
    expect(group).toHaveTextContent("local edits — deleted too");
    expect(
      screen.getByRole("button", {
        name: "remove from 2 · 1 lose local edits →",
      }),
    ).toBeEnabled();
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
        <BulkRemoveSkillAction skillName="tdd" targets={[ACME_WEB]} />
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
    renderAction([ACME_WEB]);
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

  it("says the outcome is unknown when the run's answer is lost, and re-reads the targets", async () => {
    // A lost response does not prove the server never ran: the walk may have
    // finished. Claiming nothing was removed would send the user into a retry
    // instead of a look.
    let ran = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/deploy-state")) {
          return jsonResponse({
            primitives: ran
              ? []
              : [{ type: "skill", name: "tdd", version: "v1.0.0" }],
            skipped: [],
          });
        }
        if (url.endsWith("/remove/preflight")) {
          return jsonResponse(preflightAnswer);
        }
        ran = true;
        throw new TypeError("Failed to fetch");
      }),
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <BulkRemoveSkillAction skillName="tdd" targets={[ACME_WEB]} />
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

    // Never "nothing was removed": the panel behind it already says otherwise.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /cannot say what was removed/i,
    );
    expect(await screen.findByText(/empty/i)).toBeInTheDocument();
  });
});
