import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployStateView } from "../deploy-state/deploy-state-view";
import type { DeployTarget } from "../inventory/use-deploy-skill";
import {
  expectTooltipCause,
  htmlElement,
  jsonResponse,
  renderWithQuery,
} from "../test-utils";
import { BulkRemoveRun } from "./bulk-remove-skill-action";
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

const GLOBAL = TARGETS[0] as BulkRemoveCandidate;
const ACME_WEB = TARGETS[1] as BulkRemoveCandidate;

// A receipt per target, so a test can tell "each entry carries its own answer"
// apart from "one answer was copied across the batch" (#458).
const receiptFor = (target: DeployTarget) =>
  target.kind === "global" ? "g".repeat(64) : "r".repeat(64);

const answerFor = (target: DeployTarget) => ({
  check: { scope: "repo", warning: null },
  receipt: receiptFor(target),
});

// The clean answer for the target every override leaves alone.
const preflightAnswer = answerFor(GLOBAL.target);

const emptyReport = { name: "tdd", removed: [], refused: [], failed: [] };

const ACME_API: BulkRemoveCandidate = {
  target: { kind: "repo", repoPath: "/dev/acme-api" },
  label: "/dev/acme-api",
  version: "v1.2.0",
};
const LEGACY: BulkRemoveCandidate = {
  target: { kind: "repo", repoPath: "/dev/legacy-etl" },
  label: "/dev/legacy-etl",
  version: "v1.0.0",
};

// A copy with nothing recorded to check it against.
const costly = {
  check: { scope: "repo", warning: "cannot-verify-local-edits" },
};

const never = () => new Promise<Response>(() => {});

const targetOf = (body: unknown) => (body as { target: DeployTarget }).target;

const LOCAL_CHANGES_NEXT =
  "Select Deploy skill to restore the released files. Then remove the skill.";
const PINNED_NEXT =
  "Save the changes. Restore the files from the skill's deployed version in the Harness clone. Then remove the skill.";

// One mock for both routes: the preflight answers, the bulk run reports.
function stubServer(
  overrides: {
    preflight?: (body: unknown) => Response | Promise<Response>;
    report?: (body: unknown) => Response | Promise<Response>;
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

// Stands in for the Skills pane's foot, which opens the run (#1065).
function Opener({ targets }: { targets: BulkRemoveCandidate[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open removal
      </button>
      {open ? (
        <BulkRemoveRun
          skillName="tdd"
          targets={targets}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function renderAction(targets = TARGETS) {
  renderWithQuery(<Opener targets={targets} />);
}

// The confirm once every check has answered, under the label it then carries.
const answered = async (name: string) => {
  const confirm = await screen.findByRole("button", { name });
  await waitFor(() => expect(confirm).toBeEnabled());
  return confirm;
};

const openDialog = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Open removal" }));
};

describe("BulkRemoveRun", () => {
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

    expect(
      await screen.findByRole("heading", { name: "Removed from 2 targets" }),
    ).toBeInTheDocument();
    await userEvent.click(closeButton());
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
    // A refusal is an answer: the run is told, the other target still goes, and
    // the confirm counts only what it will walk (#423).
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
      name: "Remove from 1 target",
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

  it("weighs an unverifiable copy as a cost, naming the version it destroys", async () => {
    // A costly copy is a row with its price, never part of the clean count (#423).
    stubServer({
      preflight: (body) =>
        (body as { target: { kind: string } }).target.kind === "repo"
          ? jsonResponse({
              check: { scope: "repo", warning: "cannot-verify-local-edits" },
            })
          : jsonResponse(preflightAnswer),
    });
    renderAction();
    await openDialog();

    const group = await screen.findByRole("group", {
      name: "⚠ Loses work · 1",
    });
    expect(group).toHaveTextContent("/dev/acme-web");
    expect(group).toHaveTextContent("v1.0.0");
    expect(group).toHaveTextContent("Nothing recorded — may lose work");
    expect(
      screen.getByRole("button", {
        name: "Remove from 2 targets · 1 may lose work",
      }),
    ).toBeEnabled();
  });

  it("refreshes the targets it removed from once the report is closed", async () => {
    // The pane and the deployed column read the same queries; a stale one would
    // keep listing a copy that is gone.
    let removed = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/registry/repos") {
          return jsonResponse({ repos: [{ path: "/dev/acme-web" }] });
        }
        if (url.startsWith("/api/drift")) {
          return jsonResponse({ behind: [] });
        }
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
        <Opener targets={[ACME_WEB]} />
        <MemoryRouter>
          <DeployStateView />
        </MemoryRouter>
      </>,
    );

    expect(
      await screen.findByRole("gridcell", { name: "1" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open removal" }));
    const confirm = await screen.findByRole("button", {
      name: "Remove from 1 target",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);
    await screen.findByRole("heading", { name: /^Removed from/ });
    await userEvent.click(closeButton());

    expect(await screen.findByText("Empty")).toBeInTheDocument();
  });

  it("re-checks from scratch on reopen, never confirming against the last open's answer", async () => {
    // A copy can pick up local edits between two opens (#337). The second check
    // never answers, so a live confirm means the first answer was reused.
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
      userEvent.click(screen.getByRole("button", { name: "Open removal" }));

    await openIt();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Remove from 1 target" }),
      ).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await openIt();

    expectTooltipCause(
      screen.getByRole("button", { name: "Remove from 1 target" }),
      "Checking 1 target — 0 answered",
    );
  });

  it("says Outcome unknown when the run's answer is lost, and re-reads the targets", async () => {
    // A lost response does not prove the server never ran, so the report sends
    // the user to look, not retry.
    let ran = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/registry/repos") {
          return jsonResponse({ repos: [{ path: "/dev/acme-web" }] });
        }
        if (url.startsWith("/api/drift")) {
          return jsonResponse({ behind: [] });
        }
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
        <Opener targets={[ACME_WEB]} />
        <MemoryRouter>
          <DeployStateView />
        </MemoryRouter>
      </>,
    );

    expect(
      await screen.findByRole("gridcell", { name: "1" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open removal" }));
    const confirm = await screen.findByRole("button", {
      name: "Remove from 1 target",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    // Never "nothing was removed": the panel behind it already says otherwise.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /outcome is unrecorded/i,
    );
    expect(screen.queryByRole("heading", { name: /^Removed from/ })).toBeNull();
    // Looking comes before another run: no confirm beside the notice.
    expect(footerLabels()).toEqual(["Close"]);
    await userEvent.click(closeButton());
    expect(await screen.findByText("Empty")).toBeInTheDocument();
  });

  it("says Run not started when the server refuses the request", async () => {
    // Nothing was walked, so the same attempt is still on offer.
    stubServer({
      report: () =>
        jsonResponse(
          { error: "invalid-body", message: "Malformed request." },
          400,
        ),
    });
    renderAction([ACME_WEB]);
    await userEvent.click(screen.getByRole("button", { name: "Open removal" }));
    const confirm = await screen.findByRole("button", {
      name: "Remove from 1 target",
    });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Run not started");
    expect(alert).toHaveTextContent(
      "Nothing was removed anywhere. Confirm the removal again.",
    );
    expect(alert).toHaveTextContent("The Maestro server refused the request.");
    expect(screen.queryByRole("heading", { name: /^Removed from/ })).toBeNull();
    expect(
      screen.getByText("1 target without local edits"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove from 1 target" }),
    ).toBeEnabled();
  });

  it("says Outcome unknown, with no result, when the server broke rather than refused", async () => {
    // A server that broke may have broken part-way through its own walk.
    stubServer({ report: () => jsonResponse({ error: "boom" }, 500) });
    renderAction([ACME_WEB]);
    await openDialog();
    await userEvent.click(await answered("Remove from 1 target"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Outcome unknown",
    );
    expect(screen.queryByRole("heading", { name: /^Removed from/ })).toBeNull();
  });

  it("names every target the run left behind, worst class first, with its reason", async () => {
    stubServer({
      report: () =>
        jsonResponse({
          name: "tdd",
          removed: [{ target: GLOBAL.target, version: "v1.0.0" }],
          refused: [{ target: LEGACY.target, reason: "repo-not-registered" }],
          failed: [{ target: ACME_API.target, reason: "remove-in-progress" }],
        }),
    });
    renderAction([GLOBAL, ACME_API, LEGACY]);
    await openDialog();
    await userEvent.click(await answered("Remove from 3 targets"));

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Removed from 1 of 3 targets",
      }),
    ).toBeInTheDocument();
    // The title keeps the skill; the Report's heading carries the result.
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Remove tdd from 3 targets",
      }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("heading", { level: 4 })
        .map((heading) => heading.textContent),
    ).toEqual(["✕Failed1", "✕Refused1", "✓Removed1"]);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("/dev/acme-apiTarget busy");
    expect(dialog).toHaveTextContent(
      "/dev/legacy-etlRepository not registered",
    );
    expect(dialog).toHaveTextContent("global");
    // Each left-alone target sits in the group that names its class.
    const failedGroup = groupUnder("Failed");
    expect(failedGroup).toHaveTextContent("/dev/acme-apiTarget busy");
    expect(failedGroup).not.toHaveTextContent("/dev/legacy-etl");
    const refusedGroup = groupUnder("Refused");
    expect(refusedGroup).not.toHaveTextContent("/dev/acme-api");
    expect(refusedGroup).toHaveTextContent(
      "/dev/legacy-etlRepository not registered",
    );
    // No target was left alone for local changes, so no way out is named.
    expect(dialog).not.toHaveTextContent(/Select Deploy skill/);
    expect(dialog).not.toHaveTextContent(PINNED_NEXT);
    expect(footerLabels()).toEqual(["Close"]);
  });

  it("names no Failed or Refused group after a fully clean run", async () => {
    stubServer({
      report: () =>
        jsonResponse({
          name: "tdd",
          removed: [
            { target: GLOBAL.target, version: "v1.0.0" },
            { target: ACME_WEB.target, version: "v1.0.0" },
          ],
          refused: [],
          failed: [],
        }),
    });
    renderAction();
    await openDialog();
    await userEvent.click(await answered("Remove from 2 targets"));

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Removed from 2 targets",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 4, name: /^✕?(Failed|Refused)/ }),
    ).toBeNull();
    expect(screen.getByRole("dialog")).not.toHaveTextContent(PINNED_NEXT);
  });

  it("heads a one-target run in the singular", async () => {
    stubServer({
      report: () =>
        jsonResponse({
          name: "tdd",
          removed: [{ target: ACME_WEB.target, version: "v1.0.0" }],
          refused: [],
          failed: [],
        }),
    });
    renderAction([ACME_WEB]);
    await openDialog();
    await userEvent.click(await answered("Remove from 1 target"));

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Removed from 1 target",
      }),
    ).toBeInTheDocument();
  });

  // A failed removal can still have taken the copy off disk: "go and look" and
  // "nothing left to do" are opposite instructions.
  it("adds what the probe proved about each failed target's copy", async () => {
    const failed = (target: DeployTarget, outcome: unknown) => ({
      target,
      reason: "remove-failed",
      outcome,
    });
    stubServer({
      report: () =>
        jsonResponse({
          name: "tdd",
          removed: [],
          refused: [],
          failed: [
            // apm removes for every tool at once: one tool still holding a
            // copy leaves the whole target uncleared.
            failed(GLOBAL.target, {
              scope: "global",
              tools: [
                { tool: "claude", state: "removed" },
                { tool: "codex", state: "not-removed" },
              ],
            }),
            failed(ACME_WEB.target, { scope: "repo", state: "removed" }),
            failed(ACME_API.target, { scope: "repo", state: "not-removed" }),
            failed(LEGACY.target, { scope: "repo", state: "unknown" }),
          ],
        }),
    });
    renderAction([GLOBAL, ACME_WEB, ACME_API, LEGACY]);
    await openDialog();
    await userEvent.click(await answered("Remove from 4 targets"));
    await screen.findByRole("heading", { level: 3 });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "globalRemoval outcome unknown — still there",
    );
    expect(dialog).toHaveTextContent(
      "/dev/acme-webRemoval outcome unknown — gone anyway",
    );
    expect(dialog).toHaveTextContent(
      "/dev/acme-apiRemoval outcome unknown — still there",
    );
    // A probe that could not answer proves nothing, so it says nothing.
    expect(dialog.textContent).toMatch(
      /\/dev\/legacy-etlRemoval outcome unknown(?! —)/,
    );
  });

  it("names a reason or a target it does not know by the server's own words", async () => {
    stubServer({
      report: () =>
        jsonResponse({
          name: "tdd",
          removed: [],
          refused: [],
          failed: [
            { target: GLOBAL.target, reason: "invented-later" },
            {
              target: { kind: "repo", repoPath: "/dev/gone" },
              reason: "not-deployed",
            },
          ],
        }),
    });
    renderAction([GLOBAL]);
    await openDialog();
    await userEvent.click(await answered("Remove from 1 target"));
    await screen.findByRole("heading", { level: 3 });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("globalinvented-later");
    expect(dialog).toHaveTextContent("/dev/goneNothing deployed here");
  });

  // #1436: the Report names the way out for a target left alone with local changes.
  it("names the next step in the Report for each group that holds local changes", async () => {
    stubServer({
      report: () =>
        jsonResponse({
          name: "tdd",
          removed: [{ target: GLOBAL.target, version: "v1.0.0" }],
          refused: [
            { target: ACME_WEB.target, reason: "deployed-diverged-from-lock" },
          ],
          failed: [
            {
              target: ACME_API.target,
              reason: "deployed-diverged-pinned-per-skill",
            },
          ],
        }),
    });
    renderAction([GLOBAL, ACME_WEB, ACME_API]);
    await openDialog();
    await userEvent.click(await answered("Remove from 3 targets"));
    await screen.findByRole("heading", { level: 3 });

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(LOCAL_CHANGES_NEXT);
    expect(dialog).toHaveTextContent(PINNED_NEXT);
  });
});

describe("BulkRemoveRun — while the checks run", () => {
  it("says how many checks have answered and holds the confirm until all have", async () => {
    const calls = stubServer({
      preflight: (body) => {
        const target = targetOf(body);
        return target.kind === "repo" && target.repoPath === "/dev/acme-web"
          ? jsonResponse(answerFor(target))
          : never();
      },
    });
    renderAction([GLOBAL, ACME_WEB, ACME_API]);
    await openDialog();

    expect(
      await screen.findByText("Checking 3 targets — 1 answered"),
    ).toBeInTheDocument();
    const confirm = screen.getByRole("button", {
      name: "Remove from 3 targets",
    });
    expectTooltipCause(confirm, "Checking 3 targets — 1 answered");
    await userEvent.click(confirm);
    expect(calls.filter((call) => call.url.endsWith("/remove/bulk"))).toEqual(
      [],
    );
  });

  it("cancels while the checks are still running, removing nothing", async () => {
    const calls = stubServer({ preflight: never });
    renderAction([ACME_WEB]);
    await openDialog();

    // One target names the title in the singular.
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Remove tdd from 1 target",
      }),
    ).toBeInTheDocument();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel).toBeEnabled();
    await userEvent.click(cancel);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(calls.filter((call) => call.url.endsWith("/remove/bulk"))).toEqual(
      [],
    );
  });

  // Both say something about their target, so neither holds the panel.
  it("counts a refusal and a failed check as answered", async () => {
    stubServer({
      preflight: (body) =>
        targetOf(body).kind === "global"
          ? jsonResponse({ error: "no-supported-tool" }, 409)
          : jsonResponse({ error: "preflight-failed" }, 502),
    });
    renderAction();
    await openDialog();

    expect(
      await screen.findByRole("group", { name: "✕ Cannot be removed · 1" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/Checking/);
  });
});

describe("BulkRemoveRun — once the checks answer", () => {
  it("states that nothing else goes, and shows no group beside it", async () => {
    stubServer();
    renderAction();
    await openDialog();

    const confirm = await answered("Remove from 2 targets");
    const dialog = screen.getByRole("dialog");
    // #1458: the shared Notice at success, not a hand-rolled bar.
    const clean = within(dialog)
      .getAllByRole("status")
      .find((region) =>
        region.textContent?.includes("2 targets without local edits"),
      );
    expect(clean).toHaveTextContent(
      "2 targets without local editsOnly the deployed files are removed.",
    );
    expect(within(htmlElement(clean)).getByText("✓")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(dialog).toHaveAccessibleDescription(
      /2 targets without local edits\s*Only the deployed files are removed\./,
    );
    expect(screen.queryByText(/Loses work/)).toBeNull();
    expect(screen.queryByText(/Cannot be removed/)).toBeNull();
    expect(confirm).not.toHaveAttribute("aria-disabled");
  });

  // An unknown is never reported as safe: an unverifiable copy and a check that
  // never ran are both priced as a possible loss.
  it("weighs each target on its own, refusals apart and the cost on the confirm", async () => {
    const calls = stubServer({
      preflight: (body) => {
        const target = targetOf(body);
        const path = target.kind === "repo" ? target.repoPath : "global";
        if (path === "/dev/acme-web") return jsonResponse(costly);
        if (path === "/dev/acme-api") {
          return jsonResponse({ error: "preflight-failed" }, 502);
        }
        if (path === "/dev/legacy-etl") {
          return jsonResponse({ error: "repo-not-registered" }, 404);
        }
        return jsonResponse(preflightAnswer);
      },
    });
    renderAction([GLOBAL, ACME_WEB, ACME_API, LEGACY]);
    await openDialog();

    const confirm = await answered("Remove from 3 targets · 2 may lose work");
    const cost = screen.getByRole("group", { name: "⚠ Loses work · 2" });
    expect(cost).toHaveTextContent("/dev/acme-api");
    expect(cost).toHaveTextContent("v1.2.0");
    expect(cost).toHaveTextContent("Check did not run");
    expect(
      screen.getByText("1 target without local edits"),
    ).toBeInTheDocument();
    // A target that cannot be touched costs nothing and loses nothing.
    const refused = screen.getByRole("group", {
      name: "✕ Cannot be removed · 1",
    });
    expect(within(refused).queryByText(/^v\d/)).toBeNull();
    // Only local changes have a way out the reader can take here and now.
    expect(screen.getByRole("dialog")).not.toHaveTextContent(
      /Select Deploy skill/,
    );
    // Nothing in a destructive dialog may look like a button.
    expect(footerLabels()).toEqual([
      "Cancel",
      "Remove from 3 targets · 2 may lose work",
    ]);
    expect(screen.queryByRole("link")).toBeNull();
    // The cost is read out with the question, not found afterwards.
    const described = (
      screen.getByRole("dialog").getAttribute("aria-describedby") ?? ""
    ).split(" ");
    expect(described).toHaveLength(3);
    for (const id of described) {
      expect(document.getElementById(id)).not.toBeNull();
    }

    await userEvent.click(confirm);
    await waitFor(() =>
      expect(calls.some((call) => call.url.endsWith("/remove/bulk"))).toBe(
        true,
      ),
    );
  });

  it("renders no clean line when nothing is clean", async () => {
    stubServer({ preflight: () => jsonResponse(costly) });
    renderAction([ACME_WEB]);
    await openDialog();

    await answered("Remove from 1 target · 1 may lose work");
    expect(screen.queryByText(/without local edits/)).toBeNull();
  });

  it("holds the confirm when every target refused, saying why", async () => {
    stubServer({
      preflight: () => jsonResponse({ error: "repo-not-registered" }, 404),
    });
    renderAction([LEGACY]);
    await openDialog();

    expectTooltipCause(
      await screen.findByRole("button", { name: "Remove from 0 targets" }),
      "No target can be removed.",
    );
  });

  // One removal covers every tool, so Global states the most certain loss among them.
  it("prices Global on the worst answer any of its tools gave", async () => {
    const cases: [unknown[], string | null][] = [
      [
        [
          { tool: "claude", warning: null },
          { tool: "codex", warning: "cannot-verify-local-edits" },
        ],
        "Nothing recorded — may lose work",
      ],
      // An answer naming no tool measured nothing.
      [[], "Check did not run"],
      [
        [
          { tool: "claude", warning: null },
          { tool: "codex", warning: null },
        ],
        null,
      ],
    ];
    for (const [tools, cost] of cases) {
      stubServer({
        preflight: () => jsonResponse({ check: { scope: "global", tools } }),
      });
      const { unmount } = renderWithQuery(<Opener targets={[GLOBAL]} />);
      await openDialog();
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /^Remove from 1 target/ }),
        ).toBeEnabled(),
      );

      const group = screen.queryByRole("group", { name: /Loses work/ });
      if (cost === null) {
        expect(group).toBeNull();
        expect(
          screen.getByText("1 target without local edits"),
        ).toBeInTheDocument();
      } else {
        expect(group).toHaveTextContent(cost);
      }
      unmount();
    }
  });

  // #1436: a target left alone with local changes names its way out.
  it("names refused edited copies Local edits, with each next step under them", async () => {
    stubServer({
      preflight: (body) => {
        const target = targetOf(body);
        if (target.kind === "global") return jsonResponse(preflightAnswer);
        return jsonResponse(
          {
            error:
              target.repoPath === "/dev/acme-web"
                ? "deployed-diverged-from-lock"
                : "deployed-diverged-pinned-per-skill",
          },
          409,
        );
      },
    });
    renderAction([GLOBAL, ACME_WEB, ACME_API]);
    await openDialog();

    const refused = await screen.findByRole("group", {
      name: "✕ Cannot be removed · 2",
    });
    expect(refused).toHaveTextContent("/dev/acme-webLocal edits");
    expect(refused).toHaveTextContent("/dev/acme-apiLocal edits");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      `${LOCAL_CHANGES_NEXT} ${PINNED_NEXT}`,
    );
  });

  it("keeps what it weighed in view while the confirm says Removing…", async () => {
    stubServer({
      preflight: (body) =>
        targetOf(body).kind === "repo"
          ? jsonResponse(costly)
          : jsonResponse(preflightAnswer),
      report: never,
    });
    renderAction();
    await openDialog();
    await userEvent.click(
      await answered("Remove from 2 targets · 1 may lose work"),
    );

    expect(
      await screen.findByRole("button", { name: /Removing…/ }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("⚠ Loses work · 1")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Remove tdd from 2 targets",
      }),
    ).toBeInTheDocument();
    // No report before the run answers.
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });
});

// Controls with visible words: the header's ✕ has none.
const footerLabels = () =>
  within(screen.getByRole("dialog"))
    .getAllByRole("button")
    .filter((control) => control.textContent !== "")
    .map((control) => control.textContent);

// The report group whose status heading starts with the given word.
const groupUnder = (status: string) =>
  screen
    .getByRole("heading", { level: 4, name: new RegExp(`^${status}`) })
    .closest("section") as HTMLElement;

// The footer's Close, not the header's ✕ of the same name.
function closeButton(): HTMLElement {
  return screen
    .getAllByRole("button", { name: "Close" })
    .find((control) => control.textContent === "Close") as HTMLElement;
}
