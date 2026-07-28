import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeployStateList } from "./deploy-state-list";

afterEach(() => {
  vi.unstubAllGlobals();
});

const tdd = { type: "skill" as const, name: "tdd", version: "v0.5.0" };
const REPO = "/Users/me/project";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// The confirmation's own control. Fixed text: the skill name left the label
// with #411, because the dialog's title already carries it. Only one dialog is
// ever open, so the label alone identifies the control.
const CONFIRM = "remove →";

// Opening the confirmation asks the server one read-only question — what would
// this removal destroy — so a test that cares about the removal itself has to
// tell the two calls apart.
const removeCalls = (fetchMock: { mock: { calls: unknown[][] } }) =>
  fetchMock.mock.calls.filter(([path]) => path === "/api/deploy/remove");

const preflightCalls = (fetchMock: { mock: { calls: unknown[][] } }) =>
  fetchMock.mock.calls.filter(
    ([path]) => path === "/api/deploy/remove/preflight",
  );

// A fetch stub that answers the pre-confirmation check and leaves everything
// else to the caller.
function stubFetch(
  warning: string | null,
  onRemove: () => Response = () =>
    jsonResponse(
      { removed: { type: "skill", name: "tdd", version: "v0.5.0" } },
      200,
    ),
  reclaim: { tool: string; path: string }[] = [],
) {
  const fetchMock = vi.fn(async (path: string) =>
    path === "/api/deploy/remove/preflight"
      ? jsonResponse(
          {
            warning,
            // Paths and token travel as one, exactly as the server sends them:
            // there is no consent for an empty set, so no token either.
            reclaim:
              reclaim.length > 0
                ? { previews: reclaim, token: "a".repeat(64) }
                : null,
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const list = (primitives: (typeof tdd)[]) => (
    <QueryClientProvider client={queryClient}>
      <DeployStateList
        primitives={primitives}
        skipped={[]}
        target={target}
        onRemoved={onRemoved}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(list(primitives));
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
    ).toHaveTextContent("Remove tdd v0.5.0?");
  });

  it("removes nothing when the confirmation is cancelled", async () => {
    const fetchMock = stubFetch(null);
    renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: "cancel" }));

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

  it("says so when the copy cannot be checked at all", async () => {
    stubFetch("cannot-verify-local-edits");
    renderRow();

    const dialog = await openRemoveDialog();

    expect(await within(dialog).findByRole("status")).toHaveTextContent(
      /can't be checked/i,
    );
  });

  // The check does not only answer or fail — the server can refuse the request
  // outright, and it says why. Folding that into "couldn't check" costs the user
  // a round-trip to read the reason they could have had before confirming, under
  // a warning about work that was never at risk (#385).
  describe("when the check comes back refused", () => {
    const refuseWith = (code: string, message: string, status: number) => {
      const fetchMock = vi.fn(async (path: string) =>
        path === "/api/deploy/remove/preflight"
          ? jsonResponse({ error: code, message }, status)
          : jsonResponse({ removed: { type: "skill", name: "tdd" } }, 200),
      );
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    };

    it("states the server's own reason instead of a failed check", async () => {
      refuseWith(
        "repo-not-registered",
        "That repo is not registered with Maestro.",
        403,
      );
      renderRow();

      const dialog = await openRemoveDialog();

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        "That repo is not registered with Maestro.",
      );
      expect(dialog).not.toHaveTextContent(/may lose work/i);
    });

    it("offers no confirm for a removal that cannot succeed", async () => {
      // Not a disabled one either: the server has settled it, so a control that
      // can never fire would state a way through that does not exist (#412).
      const fetchMock = refuseWith(
        "no-supported-tool",
        "No supported tool is installed, so there is no global deployment to remove.",
        409,
      );
      renderRow({ target: { kind: "global", tools: ["claude"] } });

      const dialog = await openRemoveDialog();
      await within(dialog).findByRole("alert");

      expect(screen.queryByRole("button", { name: CONFIRM })).toBeNull();
      expect(removeCalls(fetchMock)).toEqual([]);
    });

    it("still lets the user through when the check merely could not run", async () => {
      // The server was reachable and tried; it just has no answer. That settles
      // nothing about the removal, so the confirm stays where it was.
      refuseWith(
        "preflight-failed",
        "Maestro could not check the deployed copy for local changes.",
        502,
      );
      renderRow();

      const dialog = await openRemoveDialog();

      expect(await within(dialog).findByRole("status")).toHaveTextContent(
        /couldn't check this copy/i,
      );
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

  it("keeps the dialog open on failure, with apm's own reason", async () => {
    vi.stubGlobal("fetch", async () =>
      jsonResponse(
        {
          error: "remove-failed",
          message: "apm did not confirm the removal.",
        },
        502,
      ),
    );
    const { onRemoved } = renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "apm did not confirm the removal.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onRemoved).not.toHaveBeenCalled();
  });

  // The mixed-state warning follows the timing of the failure, not the presence
  // of a code. A response with no code at all — a proxy page, a server that died
  // mid-uninstall — is the case where apm most likely did run (#384).
  it("warns about a mixed state when the failure carries no error code", async () => {
    stubFetch(
      null,
      () =>
        new Response("<html>502 Bad Gateway</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
    );
    renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /may be in a mixed state/,
    );
  });

  it("stays silent about a mixed state when the removal was refused before apm ran", async () => {
    stubFetch(null, () =>
      jsonResponse(
        {
          error: "remove-in-progress",
          message: "Another change to this repo is already running.",
        },
        409,
      ),
    );
    renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Another change to this repo is already");
    expect(alert).not.toHaveTextContent(/mixed state/);
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
          return jsonResponse({ warning: null }, 200);
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
        jsonResponse(
          { error: "remove-failed", message: "apm did not confirm it." },
          502,
        ),
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
      });
    });

    it("checks what the global removal would cost before it runs", async () => {
      const fetchMock = stubFetch("local-edits-will-be-lost");
      renderGlobalRow();

      const dialog = await openRemoveDialog();

      expect(await within(dialog).findByRole("status")).toHaveTextContent(
        /local edits/i,
      );
      const [, init] = preflightCalls(fetchMock)[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        type: "skill",
        name: "tdd",
        target: { kind: "global" },
      });
    });

    // A global removal can also force-delete the whole copy of a
    // tool this machine no longer detects. The dialog must name that path
    // before the user confirms, and the confirm request must echo back
    // exactly the token this same preflight issued — never a client-rebuilt
    // path list, which a direct request could guess without ever calling
    // preflight.
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
      });
    });
  });
});
