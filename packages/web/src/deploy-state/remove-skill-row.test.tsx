import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONFIRM,
  clearToasts,
  jsonResponse,
  openRemoveDialog,
  RECEIPT,
  REPO,
  removeCalls,
  renderRow,
  screen,
  stubFetch,
  userEvent,
  within,
} from "./remove-skill-row-test-helpers";

// Split from one 32-test file (#723): under CI's oversubscribed worker pool a
// single worker falling behind on real-timer userEvent interactions cascaded
// every later test in the file past its 20s timeout. Splitting along the
// existing describe boundaries spreads the tests across more workers.

afterEach(() => {
  vi.unstubAllGlobals();
  clearToasts();
});

describe("removing a deployed skill from a row", () => {
  it("carries Remove skill in the row's actions menu, reachable by keyboard", async () => {
    renderRow();

    await userEvent.tab();
    await userEvent.keyboard("{Enter}");

    expect(
      await screen.findByRole("menuitem", { name: "Remove skill" }),
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

  it("warns about an unverifiable copy before the user confirms, and still lets them", async () => {
    const fetchMock = stubFetch("cannot-verify-local-edits");
    renderRow();

    const dialog = await openRemoveDialog();

    expect(await within(dialog).findByRole("status")).toHaveTextContent(
      /may lose work/i,
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
              check: { scope: "repo", warning: "cannot-verify-local-edits" },
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
      within(dialog).getByText("Nothing recorded — may lose work"),
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

    // apm 0.29.0 keeps an edited file and aborts after deleting the rest, so
    // the server refuses in front of it and states the safe recovery (#775,
    // copy.md R-D).
    it("explains why local changes block removal and how to recover", async () => {
      const fetchMock = refuseWith("deployed-diverged-from-lock", 409);
      renderRow();

      const dialog = await openRemoveDialog();

      expect(await within(dialog).findByRole("alert")).toHaveTextContent(
        /The skill was not removed. Its files changed after deployment/,
      );
      expect(dialog).toHaveTextContent(
        /Deploy again to restore the released files. Then remove the skill/,
      );
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
});
