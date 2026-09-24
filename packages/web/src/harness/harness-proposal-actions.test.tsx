import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  installHarnessHooks,
  RELEASED,
  renderHarness,
  row,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";

installHarnessHooks();

describe("proposal actions", () => {
  const CONNECTED: HarnessState = {
    ...RELEASED,
    freshness: {
      outcome: "fetched",
      lastFetchedAt: "2026-08-03T11:56:00.000Z",
    },
  };

  const link = (number: number) => ({
    number,
    url: `https://github.com/fimoklei/agent-harness/pull/${number}`,
  });

  const openRowMenu = async (skill: string, stage = "Pending review") => {
    await userEvent.click(
      await screen.findByRole("button", {
        name: `Actions for ${skill} in ${stage}`,
      }),
    );
    return screen.findByRole("menu");
  };

  const press = async (skill: string, name: RegExp) => {
    const menu = await openRowMenu(skill);
    await userEvent.click(within(menu).getByRole("menuitem", { name }));
  };

  it("names one skill's two menus apart, by the stage each belongs to", async () => {
    // A skill can hold a row in every stage, so a menu named only after the
    // skill would name three different sets of actions (copy.md · R-A).
    stubHarnessServer({
      read: {
        body: withStages(CONNECTED, {
          proposal: [row("pending-proposal", "tdd", "new-local-work")],
          review: [
            row("pending-review", "tdd", "waiting-for-review", {
              requests: [link(45)],
            }),
          ],
        }),
      },
    });
    renderHarness();

    expect(
      (await screen.findAllByRole("button", { name: /^Actions for tdd/ })).map(
        (trigger) => trigger.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Actions for tdd in Pending proposal",
      "Actions for tdd in Pending review",
    ]);
  });

  it("holds every action and every link for an open request", async () => {
    stubHarnessServer({
      read: {
        body: withStages(CONNECTED, {
          review: [
            row("pending-review", "tdd", "waiting-for-review", {
              requests: [link(45)],
            }),
          ],
        }),
      },
    });
    renderHarness();

    const menu = await openRowMenu("tdd");

    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["View pull request", "Withdraw proposal"]);
  });

  it("withdraws only after the approved confirmation, and closes that request", async () => {
    const proposals: { action: string; body: Record<string, unknown> }[] = [];
    stubHarnessServer({
      read: {
        body: withStages(CONNECTED, {
          review: [
            row("pending-review", "tdd", "waiting-for-review", {
              requests: [link(45)],
            }),
          ],
        }),
        afterPromote: withStages(CONNECTED, {}),
      },
      proposals,
    });
    renderHarness();

    await press("tdd", /^withdraw proposal$/i);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "This closes the pull request. Your local files and proposal branch remain unchanged.",
    );
    // Retracting is not the publishing action, so it takes no amber fill (#876).
    expect(
      within(dialog).getByRole("button", { name: "Withdraw proposal" }),
    ).not.toHaveClass("bg-amber");
    expect(proposals).toEqual([]);

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Withdraw proposal" }),
    );

    await waitFor(() =>
      expect(proposals).toEqual([
        { action: "withdraw", body: { name: "tdd", number: 45 } },
      ]),
    );
  });

  it("closes nothing when the confirmation is cancelled", async () => {
    const proposals: { action: string; body: Record<string, unknown> }[] = [];
    stubHarnessServer({
      read: {
        body: withStages(CONNECTED, {
          review: [
            row("pending-review", "tdd", "waiting-for-review", {
              requests: [link(45)],
            }),
          ],
        }),
      },
      proposals,
    });
    renderHarness();

    await press("tdd", /^withdraw proposal$/i);
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Cancel",
      }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(proposals).toEqual([]);
  });

  it("creates the missing request, and blocks withdrawal with its reason", async () => {
    const proposals: { action: string; body: Record<string, unknown> }[] = [];
    stubHarnessServer({
      read: {
        body: withStages(CONNECTED, {
          review: [row("pending-review", "tdd", "pull-request-missing")],
        }),
      },
      proposals,
    });
    renderHarness();

    const menu = await openRowMenu("tdd");
    expect(
      within(menu).getByRole("menuitem", {
        name: "Withdraw proposal — no request yet",
      }),
    ).toHaveAttribute("data-disabled");

    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Create pull request" }),
    );

    await waitFor(() =>
      expect(proposals).toEqual([{ action: "create", body: { name: "tdd" } }]),
    );
  });

  it("lists every matching link and blocks both mutations when requests are ambiguous", async () => {
    stubHarnessServer({
      read: {
        body: withStages(CONNECTED, {
          review: [
            row("pending-review", "tdd", "multiple-pull-requests", {
              requests: [link(41), link(44)],
            }),
          ],
        }),
      },
    });
    renderHarness();

    const menu = await openRowMenu("tdd");

    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual([
      "View pull request #41",
      "View pull request #44",
      "Update proposal — close the extra requests",
      "Withdraw proposal — close the extra requests",
    ]);
    for (const label of [
      "Update proposal — close the extra requests",
      "Withdraw proposal — close the extra requests",
    ]) {
      expect(
        within(menu).getByRole("menuitem", { name: label }),
      ).toHaveAttribute("data-disabled");
    }
    expect(
      within(menu).getByRole("menuitem", { name: "View pull request #41" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/fimoklei/agent-harness/pull/41",
    );
  });

  it("reopens a closed proposal, with Propose change behind it", async () => {
    const proposals: { action: string; body: Record<string, unknown> }[] = [];
    stubHarnessServer({
      read: {
        body: withStages(CONNECTED, {
          review: [
            row("pending-review", "tdd", "proposal-closed", {
              requests: [link(45)],
            }),
          ],
        }),
      },
      proposals,
    });
    renderHarness();

    const menu = await openRowMenu("tdd");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["View pull request", "Reopen proposal", "Propose change"]);

    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Reopen proposal" }),
    );

    await waitFor(() =>
      expect(proposals).toEqual([
        { action: "reopen", body: { name: "tdd", number: 45 } },
      ]),
    );
  });

  it("states a refused withdrawal in the confirmation, which stays open", async () => {
    stubHarnessServer({
      read: {
        body: withStages(CONNECTED, {
          review: [
            row("pending-review", "tdd", "waiting-for-review", {
              requests: [link(45)],
            }),
          ],
        }),
      },
      proposal: { body: { error: "request-gone" }, status: 409 },
    });
    renderHarness();

    await press("tdd", /^withdraw proposal$/i);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Withdraw proposal" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /Pull request moved on/i,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("reaches the menu and the confirmation with the keyboard alone", async () => {
    const proposals: { action: string; body: Record<string, unknown> }[] = [];
    stubHarnessServer({
      read: {
        body: withStages(CONNECTED, {
          review: [
            row("pending-review", "tdd", "waiting-for-review", {
              requests: [link(45)],
            }),
          ],
        }),
      },
      proposals,
    });
    renderHarness();

    const trigger = await screen.findByRole("button", {
      name: "Actions for tdd in Pending review",
    });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    const withdraw = within(menu).getByRole("menuitem", {
      name: "Withdraw proposal",
    });
    await waitFor(() => expect(document.activeElement).not.toBe(trigger));
    // Down the menu until the keyboard is on the item, then take it.
    for (let step = 0; step < 4 && document.activeElement !== withdraw; ) {
      await userEvent.keyboard("{ArrowDown}");
      step += 1;
    }
    expect(document.activeElement).toBe(withdraw);
    await userEvent.keyboard("{Enter}");

    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", {
      name: "Withdraw proposal",
    });
    confirm.focus();
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(proposals).toEqual([
        { action: "withdraw", body: { name: "tdd", number: 45 } },
      ]),
    );
  });
});
