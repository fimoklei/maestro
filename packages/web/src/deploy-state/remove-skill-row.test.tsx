import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
    jsonResponse({ removed: { type: "skill", name: "tdd" } }, 200),
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
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <DeployStateList
        primitives={[tdd]}
        skipped={[]}
        target={target}
        onRemoved={onRemoved}
      />
    </QueryClientProvider>,
  );
  return { onRemoved };
}

async function openRemoveDialog() {
  await userEvent.click(
    screen.getByRole("button", { name: "Actions for tdd" }),
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
    await userEvent.click(screen.getByRole("button", { name: /^remove tdd/ }));

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

    await openRemoveDialog();

    expect(await screen.findByRole("status")).toHaveTextContent(/local edits/i);
    const confirm = screen.getByRole("button", { name: /^remove tdd/ });
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);

    await waitFor(() => {
      expect(removeCalls(fetchMock)).toHaveLength(1);
    });
  });

  it("says so when the copy cannot be checked at all", async () => {
    stubFetch("cannot-verify-local-edits");
    renderRow();

    await openRemoveDialog();

    expect(await screen.findByRole("status")).toHaveTextContent(
      /can't be checked/i,
    );
  });

  it("closes and hands focus back to the card once the removal lands", async () => {
    vi.stubGlobal("fetch", async () =>
      jsonResponse({ removed: { type: "skill", name: "tdd" } }, 200),
    );
    const { onRemoved } = renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: /^remove tdd/ }));

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
    await userEvent.click(screen.getByRole("button", { name: /^remove tdd/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "apm did not confirm the removal.",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onRemoved).not.toHaveBeenCalled();
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
      await userEvent.click(
        screen.getByRole("button", { name: /^remove tdd/ }),
      );

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

      await openRemoveDialog();

      expect(await screen.findByRole("status")).toHaveTextContent(
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

      await userEvent.click(
        screen.getByRole("button", { name: /^remove tdd/ }),
      );

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
