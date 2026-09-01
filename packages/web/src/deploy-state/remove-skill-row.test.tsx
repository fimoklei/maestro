import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { DeployStateList } from "./deploy-state-list";

afterEach(() => {
  vi.unstubAllGlobals();
});

const tdd = { type: "skill" as const, name: "tdd", version: "v0.5.0" };
const REPO = "/Users/me/project";

// The confirmation's own control. Fixed text: the skill name left the label
// with #411, because the dialog's title already carries it. Only one dialog is
// ever open, so the label alone identifies the control.
const CONFIRM = "Remove skill";

// The same control after a failure: the removal was already confirmed once, so
// it offers the attempt again rather than a first one (#415).
const RETRY = "Confirm removal";

// Opening the confirmation asks the server one read-only question — what would
// this removal destroy — so a test that cares about the removal itself has to
// tell the two calls apart.
const removeCalls = (fetchMock: { mock: { calls: unknown[][] } }) =>
  fetchMock.mock.calls.filter(([path]) => path === "/api/deploy/remove");

const preflightCalls = (fetchMock: { mock: { calls: unknown[][] } }) =>
  fetchMock.mock.calls.filter(
    ([path]) => path === "/api/deploy/remove/preflight",
  );

// The answer the server would send for the scope this request named. The
// global arm reports the same verdict for both detected tools; which tool a
// verdict lands on is remove-skill-dialog's own test.
function checkFor(warning: string | null, init: RequestInit) {
  const { target } = JSON.parse(String(init.body)) as {
    target: { kind: string };
  };
  return target.kind === "repo"
    ? { scope: "repo", warning }
    : {
        scope: "global",
        tools: [
          { tool: "claude", warning },
          { tool: "codex", warning },
        ],
      };
}

// A fetch stub that answers the pre-confirmation check and leaves everything
// else to the caller.
const RECEIPT = "b".repeat(64);

function stubFetch(
  warning: string | null,
  onRemove: () => Response | Promise<Response> = () =>
    jsonResponse(
      { removed: { type: "skill", name: "tdd", version: "v0.5.0" } },
      200,
    ),
  reclaim: { tool: string; path: string }[] = [],
) {
  const fetchMock = vi.fn(async (path: string, init: RequestInit) =>
    path === "/api/deploy/remove/preflight"
      ? jsonResponse(
          {
            // Shaped by the scope the request named, the way the server shapes
            // it: one aggregate answer per repo, one answer per detected tool
            // on the global scope.
            check: checkFor(warning, init),
            // Paths and token travel as one, exactly as the server sends them:
            // there is no consent for an empty set, so no token either.
            reclaim:
              reclaim.length > 0
                ? { previews: reclaim, token: "a".repeat(64) }
                : null,
            // The proof the removal itself was priced, which the confirmation
            // has to send back or the server refuses it (#458).
            receipt: RECEIPT,
          },
          200,
        )
      : onRemove(),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderRow({
  target = { kind: "repo", repoPath: REPO } as
    | { kind: "repo"; repoPath: string }
    | { kind: "global"; tools: string[] },
  onRemoved = vi.fn(),
  primitives = [tdd],
}: {
  target?:
    | { kind: "repo"; repoPath: string }
    | { kind: "global"; tools: string[] };
  onRemoved?: () => void;
  primitives?: (typeof tdd)[];
} = {}) {
  const list = (primitives: (typeof tdd)[]) => (
    <DeployStateList
      primitives={primitives}
      skipped={[]}
      target={target}
      onRemoved={onRemoved}
    />
  );
  const { rerender } = renderWithQuery(list(primitives));
  // The refetch that follows a landed removal, as the card sees it: the row is
  // gone from the server's answer and the list re-renders without it.
  const withoutTdd = () => rerender(list([]));
  return { onRemoved, withoutTdd };
}

async function openRemoveDialog(skill = "tdd") {
  await userEvent.click(
    screen.getByRole("button", { name: `Actions for ${skill}` }),
  );
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "remove…" }),
  );
  return screen.findByRole("dialog");
}

describe("removing a deployed skill from a row", () => {
  it("carries remove… in the row's actions menu, reachable by keyboard", async () => {
    renderRow();

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    expect(
      await screen.findByRole("menuitem", { name: "remove…" }),
    ).toBeInTheDocument();
  });

  it("names the skill and the repo in the confirmation", async () => {
    renderRow();

    const dialog = await openRemoveDialog();

    expect(dialog).toHaveTextContent("tdd");
    expect(dialog).toHaveTextContent(REPO);
  });

  // The row states the deployed version; the confirmation asks about the same
  // build, so the user never has to hold it across a menu and a modal.
  it("carries the row's version into the question the confirmation asks", async () => {
    renderRow();

    await openRemoveDialog();

    expect(
      within(screen.getByRole("dialog")).getByRole("heading", { level: 2 }),
    ).toHaveTextContent("Remove tdd v0.5.0");
  });

  it("removes nothing when the confirmation is cancelled", async () => {
    const fetchMock = stubFetch(null);
    renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(removeCalls(fetchMock)).toEqual([]);
  });

  it("asks the server to remove the skill from this repo", async () => {
    const fetchMock = stubFetch(null);
    renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

    await waitFor(() => {
      expect(removeCalls(fetchMock)).toHaveLength(1);
    });
    const [path, init] = removeCalls(fetchMock)[0] as [string, RequestInit];
    expect(path).toBe("/api/deploy/remove");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      type: "skill",
      name: "tdd",
      target: { kind: "repo", repoPath: REPO },
      // Sent on every removal, not only an edited copy: the screen does not
      // second-guess which copies the server will price (#458).
      confirmedRemovalReceipt: RECEIPT,
    });
  });

  it("warns about local edits before the user confirms, and still lets them", async () => {
    const fetchMock = stubFetch("local-edits-will-be-lost");
    renderRow();

    const dialog = await openRemoveDialog();

    expect(await within(dialog).findByRole("status")).toHaveTextContent(
      /local edits/i,
    );
    const confirm = screen.getByRole("button", { name: CONFIRM });
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);

    await waitFor(() => {
      expect(removeCalls(fetchMock)).toHaveLength(1);
    });
  });

  // The window #364 closes: the copy is clean when the confirmation prices it,
  // and carries edits by the time the click lands. The dialog states what it
  // costs now and takes a second yes without being reopened.
  it("restates the cost and takes a second yes when the copy changed under the check", async () => {
    const RESTATED = "c".repeat(64);
    let attempts = 0;
    const fetchMock = stubFetch(null, () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse(
            {
              error: "cost-not-acknowledged",
              check: { scope: "repo", warning: "local-edits-will-be-lost" },
              receipt: RESTATED,
            },
            409,
          )
        : jsonResponse(
            { removed: { type: "skill", name: "tdd", version: "v0.5.0" } },
            200,
          );
    });
    renderRow();

    const dialog = await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

    expect(
      await within(dialog).findByText(/changed since this removal was priced/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Local edits — deleted too"),
    ).toBeInTheDocument();

    // Still the first offer, not a retry: nothing was removed.
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

    await waitFor(() => {
      expect(removeCalls(fetchMock)).toHaveLength(2);
    });
    const [, init] = removeCalls(fetchMock)[1] as [string, RequestInit];
    // The receipt that came with the restated cost, so the second yes answers
    // the question the first refusal asked.
    expect(JSON.parse(String(init.body))).toMatchObject({
      confirmedRemovalReceipt: RESTATED,
    });
  });

  it("says so when the copy cannot be checked at all", async () => {
    stubFetch("cannot-verify-local-edits");
    renderRow();

    const dialog = await openRemoveDialog();

    expect(
      await within(dialog).findByText("Nothing recorded — may lose work"),
    ).toBeInTheDocument();
  });

  // The server can also refuse the check outright and say why — folding that
  // into "couldn't check" would hide the reason (#385).
  describe("when the check comes back refused", () => {
    const refuseWith = (code: string, status: number) => {
      const fetchMock = vi.fn(async (path: string) =>
        path === "/api/deploy/remove/preflight"
          ? jsonResponse({ error: code }, status)
          : jsonResponse({ removed: { type: "skill", name: "tdd" } }, 200),
      );
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    };

    it("states the server's own reason instead of a failed check", async () => {
      refuseWith("repo-not-registered", 403);
      renderRow();

      const dialog = await openRemoveDialog();

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        /Register this repository in Maestro/,
      );
      expect(dialog).not.toHaveTextContent(/may lose work/i);
    });

    it("offers no confirm for a removal that cannot succeed", async () => {
      // Not a disabled one either: the server has settled it, so a control that
      // can never fire would state a way through that does not exist (#412).
      const fetchMock = refuseWith("no-supported-tool", 409);
      renderRow({ target: { kind: "global", tools: ["claude"] } });

      const dialog = await openRemoveDialog();
      await within(dialog).findByRole("alert");

      expect(screen.queryByRole("button", { name: CONFIRM })).toBeNull();
      expect(removeCalls(fetchMock)).toEqual([]);
    });

    it("still lets the user through when the check merely could not run", async () => {
      // The server was reachable and tried; it just has no answer. That settles
      // nothing about the removal, so the confirm stays where it was.
      refuseWith("preflight-failed", 502);
      renderRow();

      const dialog = await openRemoveDialog();

      expect(
        await within(dialog).findByText("Check did not run — may lose work"),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: CONFIRM })).toBeEnabled();
    });
  });

  it("closes and hands focus back to the card once the removal lands", async () => {
    vi.stubGlobal("fetch", async () =>
      jsonResponse({ removed: { type: "skill", name: "tdd" } }, 200),
    );
    const { onRemoved } = renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // The trigger the modal would normally restore focus to disappears with the
    // row, so the card's header takes it instead.
    await waitFor(() => {
      expect(onRemoved).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the dialog open on failure, with the removal's own reason", async () => {
    vi.stubGlobal("fetch", async () =>
      jsonResponse({ error: "remove-failed" }, 502),
    );
    const { onRemoved } = renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /The removal ran but proved nothing/,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onRemoved).not.toHaveBeenCalled();
  });

  // The retry is the same removal, not a fresh one the user has to describe
  // again: same skill, same target, straight from the panel that reported the
  // failure (#415).
  it("re-fires the same removal against the same target when retried", async () => {
    let attempts = 0;
    const fetchMock = stubFetch(null, () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ error: "remove-failed" }, 502)
        : jsonResponse(
            { removed: { type: "skill", name: "tdd", version: "v0.5.0" } },
            200,
          );
    });
    const { onRemoved } = renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
    await userEvent.click(await screen.findByRole("button", { name: RETRY }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // Both requests, asserted as one list: what makes this a retry rather than
    // a second removal is that the two are the same request.
    const sameRemoval = expect.objectContaining({
      name: "tdd",
      target: { kind: "repo", repoPath: REPO },
    });
    expect(
      removeCalls(fetchMock).map(([, init]) =>
        JSON.parse(String((init as RequestInit).body)),
      ),
    ).toEqual([sameRemoval, sameRemoval]);
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  // The mutation drops its error the moment the retry starts, which would take
  // the failure block, the red outline and `close` with it — the panel would
  // leave its failed state during the very attempt that state offered (#415).
  it("keeps stating the failure while the retry is in flight", async () => {
    let attempts = 0;
    stubFetch(null, () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ error: "remove-failed" }, 502)
        : // A retry that never answers, so the in-flight panel can be read.
          new Promise<Response>(() => undefined);
    });
    renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
    await userEvent.click(await screen.findByRole("button", { name: RETRY }));

    expect(
      await screen.findByRole("button", { name: /removing/i }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /The removal ran but proved nothing/,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });

  // apm can remove a skill and still fail to prove it, which leaves the entry
  // gone from the lockfile. The retry then finds nothing to remove — the first
  // attempt did land, so reporting a second failure would be the cockpit
  // calling a finished removal broken (#415).
  it("settles the removal when the retry finds nothing left", async () => {
    let attempts = 0;
    stubFetch(null, () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ error: "remove-failed" }, 502)
        : jsonResponse({ error: "not-deployed" }, 404);
    });
    const { onRemoved } = renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
    await userEvent.click(await screen.findByRole("button", { name: RETRY }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(onRemoved).toHaveBeenCalledTimes(1);
    // No trace line: the server never named the version this removal ran
    // against, and the screen's own guess is not its answer (#383). The row
    // leaving the refetched card is the evidence.
    expect(screen.queryByText(/removed tdd/)).toBeNull();
  });

  // The same answer on a first attempt means the skill was never deployed here.
  // Nothing landed, so there is nothing to settle.
  it("keeps a first attempt open when the skill is not deployed", async () => {
    stubFetch(null, () => jsonResponse({ error: "not-deployed" }, 404));
    const { onRemoved } = renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Nothing was deleted/,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onRemoved).not.toHaveBeenCalled();
  });

  // A removal takes its own row off the screen, so absence is the only evidence
  // left behind. The card says what went instead (#383).
  describe("announcing the outcome", () => {
    it("names the skill, its version and the target once the removal lands", async () => {
      stubFetch(null);
      renderRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      expect(
        await screen.findByText(`removed tdd v0.5.0 from ${REPO}`),
      ).toBeInTheDocument();
    });

    it("announces it without stealing focus", async () => {
      stubFetch(null);
      renderRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      const announcement = await screen.findByText(
        `removed tdd v0.5.0 from ${REPO}`,
      );
      expect(announcement.closest("[role='status']")).not.toBeNull();
    });

    // The row's version can be stale by the time the user confirms — another
    // deploy may have moved it while the confirmation was open. The trace states
    // what the server actually removed, never what the screen happened to show.
    it("names the version the server removed, not the one the row showed", async () => {
      stubFetch(null, () =>
        jsonResponse(
          { removed: { type: "skill", name: "tdd", version: "v0.9.0" } },
          200,
        ),
      );
      renderRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      expect(
        await screen.findByText(`removed tdd v0.9.0 from ${REPO}`),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(`removed tdd v0.5.0 from ${REPO}`),
      ).not.toBeInTheDocument();
    });

    // role="status" is atomic: a region holding the whole history re-reads every
    // earlier line on each new removal. The history stays visible; only the
    // latest outcome is announced.
    it("announces only the latest removal, with the earlier ones still on screen", async () => {
      const jobs = { type: "skill" as const, name: "jobs", version: "v1.2.0" };
      // Each removal is answered for the skill it named, so the two traces
      // cannot be told apart by accident.
      vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
        if (path === "/api/deploy/remove/preflight") {
          return jsonResponse(
            { check: { scope: "repo", warning: null }, reclaim: null },
            200,
          );
        }
        const { name } = JSON.parse(String(init.body));
        const version = name === "tdd" ? "v0.5.0" : "v1.2.0";
        return jsonResponse({ removed: { type: "skill", name, version } }, 200);
      });
      renderRow({ primitives: [tdd, jobs] });

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
      await screen.findByText(`removed tdd v0.5.0 from ${REPO}`);

      await openRemoveDialog("jobs");
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
      await screen.findByText(`removed jobs v1.2.0 from ${REPO}`);

      const live = screen.getByRole("status");
      expect(live).toHaveTextContent(`removed jobs v1.2.0 from ${REPO}`);
      expect(live).not.toHaveTextContent(`removed tdd v0.5.0 from ${REPO}`);
    });

    // The detected tool set is probed server-side when the removal runs, so a
    // tool appearing while the confirmation is open changes the real scope. The
    // trace names the set apm actually reached, not the one the card knew.
    it("names the tools the server reached, not the ones the card knew", async () => {
      stubFetch(null, () =>
        jsonResponse(
          {
            removed: {
              type: "skill",
              name: "tdd",
              version: "v0.5.0",
              scope: { kind: "global", tools: ["claude", "codex"] },
            },
          },
          200,
        ),
      );
      renderRow({ target: { kind: "global", tools: ["claude"] } });

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      expect(
        await screen.findByText(
          "removed tdd v0.5.0 from Claude Code and Codex",
        ),
      ).toBeInTheDocument();
    });

    // An older server answers 200 with no version. Saying so beats printing the
    // word "undefined" over a removal that already happened.
    it("says the version is unknown when the server reported none", async () => {
      stubFetch(null, () =>
        jsonResponse({ removed: { type: "skill", name: "tdd" } }, 200),
      );
      renderRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      expect(
        await screen.findByText(`removed tdd (version unknown) from ${REPO}`),
      ).toBeInTheDocument();
    });

    it("says nothing when the removal failed", async () => {
      vi.stubGlobal("fetch", async () =>
        jsonResponse({ error: "remove-failed" }, 502),
      );
      renderRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      await screen.findByRole("alert");
      expect(screen.queryByText(/^removed tdd/)).not.toBeInTheDocument();
    });

    it("stays on the card after the last skill on it is gone", async () => {
      stubFetch(null);
      const { withoutTdd } = renderRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
      await screen.findByText(`removed tdd v0.5.0 from ${REPO}`);
      withoutTdd();

      expect(
        screen.getByText(`removed tdd v0.5.0 from ${REPO}`),
      ).toBeInTheDocument();
    });
  });

  // The global row. One action covers every detected tool, and the confirmation
  // has to name them — the user clicked inside one tool's card (#338).
  describe("on a global row", () => {
    const renderGlobalRow = () =>
      renderRow({ target: { kind: "global", tools: ["claude", "codex"] } });

    it("offers remove… just as a repo row does", async () => {
      stubFetch(null);
      renderGlobalRow();

      await openRemoveDialog();

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("names every detected tool in the confirmation", async () => {
      stubFetch(null);
      renderGlobalRow();

      const dialog = await openRemoveDialog();

      expect(dialog).toHaveTextContent("Claude Code");
      expect(dialog).toHaveTextContent("Codex");
    });

    it("asks the server for a global removal, carrying no path", async () => {
      const fetchMock = stubFetch(null);
      renderGlobalRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      await waitFor(() => {
        expect(removeCalls(fetchMock)).toHaveLength(1);
      });
      const [, init] = removeCalls(fetchMock)[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        type: "skill",
        name: "tdd",
        target: { kind: "global" },
        confirmedRemovalReceipt: RECEIPT,
      });
    });

    it("checks what the global removal would cost before it runs", async () => {
      const fetchMock = stubFetch("local-edits-will-be-lost");
      renderGlobalRow();

      const dialog = await openRemoveDialog();

      const region = await within(dialog).findByRole("status", {
        name: /removed from/i,
      });
      expect(
        within(region).getAllByText("Local edits — deleted too"),
      ).toHaveLength(2);
      const [, init] = preflightCalls(fetchMock)[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        type: "skill",
        name: "tdd",
        target: { kind: "global" },
      });
    });

    // A global removal can force-delete an undetected tool's copy — confirm
    // must echo preflight's own token, never a client-rebuilt path list.
    // The machine's tools can change between the check and the click too, so a
    // restated cost brings its own leftovers. Sending the older token beside
    // the newer cost would leave a copy the dialog named still on disk (#390).
    it("confirms a restated cost with the leftovers that came with it", async () => {
      const RESTATED = "c".repeat(64);
      const RESTATED_TOKEN = "d".repeat(64);
      let attempts = 0;
      const fetchMock = stubFetch(null, () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse(
              {
                error: "cost-not-acknowledged",
                check: {
                  scope: "global",
                  tools: [
                    { tool: "codex", warning: "local-edits-will-be-lost" },
                    { tool: "claude", warning: null },
                  ],
                },
                receipt: RESTATED,
                reclaim: {
                  previews: [
                    { tool: "claude", path: "/Users/me/.claude/skills/tdd" },
                  ],
                  token: RESTATED_TOKEN,
                },
              },
              409,
            )
          : jsonResponse(
              { removed: { type: "skill", name: "tdd", version: "v0.5.0" } },
              200,
            );
      }, [{ tool: "claude", path: "/Users/me/.claude/skills/tdd" }]);
      renderGlobalRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
      await waitFor(() => {
        expect(removeCalls(fetchMock)).toHaveLength(1);
      });
      await userEvent.click(
        await screen.findByRole("button", { name: CONFIRM }),
      );

      await waitFor(() => {
        expect(removeCalls(fetchMock)).toHaveLength(2);
      });
      const [, init] = removeCalls(fetchMock)[1] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toMatchObject({
        confirmedRemovalReceipt: RESTATED,
        confirmedReclaimToken: RESTATED_TOKEN,
      });
    });

    it("names the leftover copy and confirms with preflight's own token", async () => {
      const fetchMock = stubFetch(null, undefined, [
        { tool: "claude", path: "/Users/me/.claude/skills/tdd" },
      ]);
      renderGlobalRow();

      const dialog = await openRemoveDialog();
      expect(dialog).toHaveTextContent("/Users/me/.claude/skills/tdd");

      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      await waitFor(() => {
        expect(removeCalls(fetchMock)).toHaveLength(1);
      });
      const [, init] = removeCalls(fetchMock)[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        type: "skill",
        name: "tdd",
        target: { kind: "global" },
        confirmedReclaimToken: "a".repeat(64),
        confirmedRemovalReceipt: RECEIPT,
      });
    });
  });

  // Through the mounted row and a real QueryClient, so the whole reopen — the
  // row's own query observer included — is what holds the confirm, not the
  // mapper read in isolation (#381).
  describe("when the confirmation is reopened for the same row", () => {
    it("holds the confirm at checking until the fresh check answers", async () => {
      let releaseSecondCheck = () => {};
      let checks = 0;
      const fetchMock = vi.fn(async (path: string, init: RequestInit) => {
        if (path !== "/api/deploy/remove/preflight") {
          throw new Error(`unexpected request: ${path}`);
        }
        checks += 1;
        if (checks === 2) {
          await new Promise<void>((resolve) => {
            releaseSecondCheck = resolve;
          });
        }
        return jsonResponse(
          {
            // A different answer each time, so a stale one on screen shows up
            // as the first open's verdict rather than as no verdict at all.
            check: checkFor(
              checks === 1 ? null : "local-edits-will-be-lost",
              init,
            ),
            reclaim: null,
            receipt: RECEIPT,
          },
          200,
        );
      });
      vi.stubGlobal("fetch", fetchMock);
      renderRow();

      await openRemoveDialog();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: CONFIRM })).toBeEnabled();
      });
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await openRemoveDialog();
      expect(
        screen.getByRole("status", { name: "Local-edits check" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: CONFIRM })).toBeDisabled();

      releaseSecondCheck();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: CONFIRM })).toBeEnabled();
      });
      // The second check's answer, not the clean one the first open reported.
      expect(await screen.findByRole("dialog")).toHaveTextContent(
        /local (edits|changes)/i,
      );
    });
  });
});
