import type { HarnessStageRow, HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectTooltipCause, sentence } from "../test-utils";
import {
  installHarnessHooks,
  openPane,
  openRowMenu,
  RELEASED,
  renderHarness,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";
import { stageRow } from "./stage-row-fixture";

installHarnessHooks();

const CONNECTED: HarnessState = {
  ...RELEASED,
  freshness: {
    outcome: "fetched",
    lastFetchedAt: "2026-08-03T11:56:00.000Z",
  },
};

// The Categories row under Pending release, as the server sends it.
const listRow = (over: Partial<HarnessStageRow> = {}): HarnessStageRow =>
  stageRow("pending-release", "categories", "not-yet-released", {
    type: "categories",
    path: ".maestro/categories.yml",
    branch: "maestro/list.categories",
    change: "edit",
    mergedRequest: 45,
    ...over,
  });

const merged = (over: Partial<HarnessStageRow> = {}) =>
  withStages(CONNECTED, { release: [listRow(over)] });

const settled = async () => {
  const reread = await screen.findByRole("button", {
    name: "Re-read Harness",
  });
  await waitFor(() => expect(reread).not.toHaveAttribute("aria-busy"));
};

const menu = () => openRowMenu("Categories", "Pending release", "categories");

const openWithdrawal = async () => {
  await settled();
  await userEvent.click(
    within(await menu()).getByRole("menuitem", {
      name: "Withdraw from release",
    }),
  );
  return screen.findByRole("dialog", {
    name: "Withdraw Categories from release",
  });
};

const confirmButton = (dialog: HTMLElement) =>
  within(dialog).getByRole("button", { name: /^Withdraw from release/ });

describe("Withdraw from release on the Categories row", () => {
  // The spec places Open Categories in Settings under Pending review only.
  it("is the row's one item", async () => {
    stubHarnessServer({ read: { body: merged() } });
    renderHarness();
    await settled();

    const items = within(await menu()).getAllByRole("menuitem");

    expect(items.map((item) => item.textContent)).toEqual([
      "Withdraw from release",
    ]);
    expect(items[0]).not.toHaveAttribute("aria-disabled");
  });

  it("states that every categories change merged since the latest release goes, naming the merged pull request", async () => {
    const withdrawals: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: merged() },
      releaseWithdrawals: withdrawals,
    });
    renderHarness();

    const dialog = await openWithdrawal();

    expect(
      within(dialog).getByText(
        sentence(
          "This takes every categories change merged since the latest release out of the next release on GitHub, including pull request #45.",
        ),
      ),
    ).toBeVisible();
    expect(within(dialog).queryByText(/stay as they are/)).toBeNull();
    expect(dialog).toHaveTextContent("File.maestro/categories.yml");
    expect(dialog).not.toHaveTextContent("Pending proposal");
    expect(withdrawals).toEqual([]);
  });

  it("leaves the pull request out where none is known", async () => {
    stubHarnessServer({ read: { body: merged({ mergedRequest: null }) } });
    renderHarness();

    const dialog = await openWithdrawal();

    expect(
      within(dialog).getByText(
        sentence(
          "This takes every categories change merged since the latest release out of the next release on GitHub.",
        ),
      ),
    ).toBeVisible();
  });

  it("names the deletion of the file where it was deleted by hand", async () => {
    stubHarnessServer({
      read: { body: merged({ change: "deletion", mergedRequest: null }) },
    });
    renderHarness();

    const dialog = await openWithdrawal();

    expect(
      within(dialog).getByText(
        sentence(
          "This takes the deletion of the categories file out of the next release on GitHub.",
        ),
      ),
    ).toBeVisible();
  });

  it.each([
    [
      45,
      "This takes every categories change merged since the latest release out of the next release on GitHub, including pull request #45. The latest release has no categories, so the next release then has none either.",
    ],
    [
      null,
      "This takes every categories change merged since the latest release out of the next release on GitHub. The latest release has no categories, so the next release then has none either.",
    ],
  ])(
    "says the next release has none where the latest release has no categories (pull request %s)",
    async (mergedRequest, text) => {
      stubHarnessServer({
        read: { body: merged({ change: "addition", mergedRequest }) },
      });
      renderHarness();

      const dialog = await openWithdrawal();

      expect(within(dialog).getByText(sentence(text))).toBeVisible();
    },
  );

  it("sends the list and its confirmation, then says so", async () => {
    const withdrawals: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: merged(), afterPromote: withStages(CONNECTED, {}) },
      releaseWithdrawal: { body: { name: "categories" } },
      releaseWithdrawals: withdrawals,
    });
    renderHarness();
    const dialog = await openWithdrawal();
    await waitFor(() =>
      expect(confirmButton(dialog)).not.toHaveAttribute("aria-disabled"),
    );

    await userEvent.click(confirmButton(dialog));

    await waitFor(() =>
      expect(withdrawals).toEqual([
        { type: "categories", confirmation: "token-1" },
      ]),
    );
    expect(
      await screen.findByText(sentence("Withdrew Categories from release.")),
    ).toBeInTheDocument();
  });

  it("states a failed push under the Categories heading", async () => {
    stubHarnessServer({
      read: { body: merged() },
      releaseWithdrawal: { body: { error: "withdraw-failed" }, status: 502 },
    });
    renderHarness();
    const dialog = await openWithdrawal();
    await waitFor(() =>
      expect(confirmButton(dialog)).not.toHaveAttribute("aria-disabled"),
    );

    await userEvent.click(confirmButton(dialog));

    expect(
      await within(dialog).findByText("Categories not withdrawn"),
    ).toBeVisible();
  });

  it("states a check that found no categories change", async () => {
    stubHarnessServer({
      read: { body: merged() },
      releaseWithdrawalCheck: {
        body: { error: "not-pending-release" },
        status: 409,
      },
    });
    renderHarness();

    const dialog = await openWithdrawal();

    expect(
      await within(dialog).findByText("Not under Pending release"),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(
      "Select Re-read Harness to see the categories as they are now.",
    );
    expect(dialog).toHaveTextContent(
      "No categories change is under Pending release now.",
    );
  });

  it("states a check blocked by an unknown pull request read", async () => {
    stubHarnessServer({
      read: { body: merged() },
      releaseWithdrawalCheck: { body: { error: "proposal-open" }, status: 409 },
    });
    renderHarness();

    const dialog = await openWithdrawal();

    expect(await within(dialog).findByText("Withdrawal blocked")).toBeVisible();
    expect(dialog).toHaveTextContent(
      "A categories pull request is open, or GitHub could not be read.",
    );
  });

  describe("while it is blocked", () => {
    const paneButton = async () =>
      within(await openPane("Categories", "Pending release")).getByRole(
        "button",
        { name: "Withdraw from release" },
      );

    it("blocks the menu item without a cause", async () => {
      stubHarnessServer({ read: { body: merged({ openRequests: [46] }) } });
      renderHarness();
      await settled();

      const item = within(await menu()).getByRole("menuitem", {
        name: "Withdraw from release",
      });

      expect(item).toHaveAttribute("aria-disabled", "true");
      expect(item).not.toHaveAccessibleDescription();
    });

    it.each([
      [
        "the operator's own pull request is open",
        { openRequests: [46], openByOther: false },
        "Merge pull request #46 on GitHub, or select Withdraw proposal.",
      ],
      [
        "another contributor's pull request is open",
        { openRequests: [46], openByOther: true },
        "Merge or close pull request #46 on GitHub.",
      ],
      [
        "GitHub could not be read",
        { openRequests: null },
        "Select Re-read Harness to read GitHub again.",
      ],
    ])(
      "names the cause on the pane-foot button while %s",
      async (_, over, cause) => {
        stubHarnessServer({ read: { body: merged(over) } });
        renderHarness();

        expectTooltipCause(await paneButton(), cause);
      },
    );

    it("states the matching cause when the press is refused", async () => {
      stubHarnessServer({
        read: { body: merged() },
        releaseWithdrawal: {
          body: { error: "proposal-open" },
          status: 409,
          thenRead: merged({ openRequests: [46], openByOther: true }),
        },
      });
      renderHarness();
      const dialog = await openWithdrawal();
      await waitFor(() =>
        expect(confirmButton(dialog)).not.toHaveAttribute("aria-disabled"),
      );

      await userEvent.click(confirmButton(dialog));

      expect(
        await within(dialog).findByText(
          sentence(
            "Nothing was withdrawn. Merge or close pull request #46 on GitHub.",
          ),
        ),
      ).toBeVisible();
    });
  });
});
