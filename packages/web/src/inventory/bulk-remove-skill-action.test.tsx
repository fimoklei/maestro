import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployStatePanel } from "../deploy-state/deploy-state-panel";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { BulkRemoveSkillAction } from "./bulk-remove-skill-action";
import type { BulkRemoveCandidate } from "./bulk-remove-targets";
import type { DeployTarget } from "./use-deploy-skill";

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

const GLOBAL = TARGETS[0] as BulkRemoveCandidate;
const ACME_WEB = TARGETS[1] as BulkRemoveCandidate;

// A receipt per target, so a test can tell "each entry carries its own answer"
// apart from "one answer was copied across the batch" (#458).
const receiptFor = (target: DeployTarget) =>
  target.kind === "global" ? "g".repeat(64) : "r".repeat(64);

const answerFor = (target: DeployTarget) => ({
  check: { scope: "repo", warning: null },
  reclaim: null,
  receipt: receiptFor(target),
});

// The clean answer for the target every override leaves alone.
const preflightAnswer = answerFor(GLOBAL.target);

const emptyReport = { name: "tdd", removed: [], refused: [], failed: [] };

// One mock for both routes: the preflight answers, the bulk run reports.
function stubServer(
  overrides: {
    preflight?: (body: unknown) => Response;
    report?: (body: unknown) => Response;
  } = {},
) {
  const calls: { url: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      body: init?.body === undefined ? null : JSON.parse(String(init.body)),
    });
    if (url.endsWith("/remove/preflight")) {
      const body = JSON.parse(String(init?.body)) as { target: DeployTarget };
      return (
        overrides.preflight?.(body) ?? jsonResponse(answerFor(body.target))
      );
    }
    const body =
      init?.body === undefined ? null : JSON.parse(String(init.body));
    return overrides.report?.(body) ?? jsonResponse(emptyReport);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderAction(targets = TARGETS) {
  renderWithQuery(<BulkRemoveSkillAction skillName="tdd" targets={targets} />);
}

const openDialog = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: "Remove from all 2 targets" }),
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

  it("sends one request for the whole run, and reports what it did", async () => {
    const calls = stubServer({
      report: () =>
        jsonResponse({
          name: "tdd",
          removed: TARGETS.map((candidate) => ({
            target: candidate.target,
            version: "v1.0.0",
          })),
          refused: [],
          failed: [],
        }),
    });
    renderAction();
    await openDialog();

    const confirm = await screen.findByRole("button", {
      name: "Remove from 2 targets",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    // The run's outcome replaces the question rather than vanishing with it.
    const dialog = await screen.findByRole("dialog", { name: "Removed tdd" });
    expect(dialog).toHaveTextContent("Removed 2 · refused 0 · failed 0");
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    const runs = calls.filter((call) => call.url.endsWith("/remove/bulk"));
    expect(runs).toHaveLength(1);
    expect(runs[0]?.body).toEqual({
      name: "tdd",
      targets: [
        {
          target: GLOBAL.target,
          confirmedRemovalReceipt: receiptFor(GLOBAL.target),
        },
        {
          target: ACME_WEB.target,
          confirmedRemovalReceipt: receiptFor(ACME_WEB.target),
        },
      ],
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
      name: "Remove from 1 targets",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() => {
      const runs = calls.filter((call) => call.url.endsWith("/remove/bulk"));
      expect(runs[0]?.body).toEqual({
        name: "tdd",
        targets: [
          // The target that did get an answer carries its receipt; the refused
          // one never had a check to mint it.
          {
            target: GLOBAL.target,
            confirmedRemovalReceipt: receiptFor(GLOBAL.target),
          },
          { target: ACME_WEB.target, refused: "repo-not-registered" },
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
      name: "✕ Cannot be removed · 1",
    });
    expect(group).toHaveTextContent("/dev/acme-web");
    expect(group).toHaveTextContent("Repository not registered");
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
      name: "▲ Loses work · 1",
    });
    expect(group).toHaveTextContent("/dev/acme-web");
    expect(group).toHaveTextContent("v1.0.0");
    expect(group).toHaveTextContent("Local edits — deleted too");
    expect(
      screen.getByRole("button", {
        name: "Remove from 2 targets · 1 lose local edits",
      }),
    ).toBeEnabled();
  });

  it("refreshes the targets it removed from once the report is closed", async () => {
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

    renderWithQuery(
      <>
        <BulkRemoveSkillAction skillName="tdd" targets={[ACME_WEB]} />
        <DeployStatePanel repo="/dev/acme-web" onStartDeploy={() => {}} />
      </>,
    );

    expect(await screen.findByText("v1.0.0")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove from all 1 target" }),
    );
    const confirm = await screen.findByRole("button", {
      name: "Remove from 1 targets",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);
    // The pane behind the report is re-read on the way out, so what it lists
    // afterwards is exactly what still holds the skill.
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));

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
        screen.getByRole("button", { name: "Remove from all 1 target" }),
      );

    await openIt();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Remove from 1 targets" }),
      ).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await openIt();

    expect(
      screen.getByRole("button", { name: "Remove from 1 targets" }),
    ).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Checking 1 targets — 0 answered",
    );
  });

  it("says Outcome unknown when the run's answer is lost, and re-reads the targets", async () => {
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

    renderWithQuery(
      <>
        <BulkRemoveSkillAction skillName="tdd" targets={[ACME_WEB]} />
        <DeployStatePanel repo="/dev/acme-web" onStartDeploy={() => {}} />
      </>,
    );

    expect(await screen.findByText("v1.0.0")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Remove from all 1 target" }),
    );
    const confirm = await screen.findByRole("button", {
      name: "Remove from 1 targets",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    // Never "nothing was removed": the panel behind it already says otherwise.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /outcome is unrecorded/i,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByText(/empty/i)).toBeInTheDocument();
  });

  it("says Run not started when the server refuses the request", async () => {
    // The server answered, so nothing was walked. The same attempt is still on
    // offer, against the body it would act on.
    stubServer({
      report: () =>
        jsonResponse(
          { error: "invalid-body", message: "Malformed request." },
          400,
        ),
    });
    renderAction([ACME_WEB]);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove from all 1 target" }),
    );
    const confirm = await screen.findByRole("button", {
      name: "Remove from 1 targets",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Run not started",
    );
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/refused 0/);
    expect(
      screen.getByRole("button", { name: "Remove from 1 targets" }),
    ).toBeEnabled();
  });

  it("names every target the run left behind, with its class and its reason", async () => {
    stubServer({
      report: () =>
        jsonResponse({
          name: "tdd",
          removed: [{ target: TARGETS[0]?.target, version: "v1.0.0" }],
          refused: [{ target: ACME_WEB.target, reason: "repo-not-registered" }],
          failed: [],
        }),
    });
    renderAction();
    await openDialog();

    const confirm = await screen.findByRole("button", {
      name: "Remove from 2 targets",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    expect(
      await screen.findByRole("dialog", {
        name: "Removed tdd from 1 of 2 targets",
      }),
    ).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "✕ Left alone · 1" });
    expect(group).toHaveTextContent("/dev/acme-web");
    expect(group).toHaveTextContent("refused");
    expect(group).toHaveTextContent("Repository not registered");
    const controls = within(screen.getByRole("dialog")).getAllByRole("button");
    expect(controls.map((control) => control.textContent)).toEqual(["Close"]);
  });
});
