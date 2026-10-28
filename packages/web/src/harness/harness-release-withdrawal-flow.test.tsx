import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectTooltipCause, sentence } from "../test-utils";
import {
  harnessRegion,
  installHarnessHooks,
  ON_DISK,
  openPane,
  openRowMenu,
  renderHarness,
  row,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";

installHarnessHooks();

describe("Harness withdraw from release", () => {
  // A merged edit to code-review, waiting for the next release (#1642).
  const MERGED: HarnessState = withStages(ON_DISK, {
    release: [
      row("pending-release", "code-review", "not-yet-released", {
        onDisk: true,
      }),
    ],
  });

  // The release copy is back in the clone: the withdrawal waits for its
  // proposal, and the merged change still waits for the release.
  const WITHDRAWN: HarnessState = withStages(ON_DISK, {
    proposal: [
      row("pending-proposal", "code-review", "not-yet-proposed", {
        onDisk: true,
        remoteTree: "remote-code-review",
        alsoIn: ["pending-release"],
      }),
    ],
    release: [
      row("pending-release", "code-review", "not-yet-released", {
        onDisk: true,
        alsoIn: ["pending-proposal"],
      }),
    ],
  });

  const openWithdrawal = async () => {
    const menu = await openRowMenu("code-review", "Pending release");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Withdraw from release" }),
    );
    return screen.findByRole("dialog", {
      name: "Withdraw code-review from release",
    });
  };

  const confirmButton = (dialog: HTMLElement) =>
    within(dialog).getByRole("button", { name: /^Withdraw from release/ });

  it("withdraws nothing until the dialog is confirmed, and lists no files without unproposed work", async () => {
    const withdrawals: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: MERGED },
      releaseWithdrawals: withdrawals,
    });
    renderHarness();

    const dialog = await openWithdrawal();

    expect(
      within(dialog).getByText(
        sentence(
          "This replaces the skill folder in your clone with its copy in the latest release. The skill then waits under Pending proposal. Deployed copies remain unchanged.",
        ),
      ),
    ).toBeVisible();
    await waitFor(() =>
      expect(confirmButton(dialog)).not.toHaveAttribute("aria-disabled"),
    );
    expect(within(dialog).queryByText("Changes not yet proposed")).toBeNull();
    expect(withdrawals).toEqual([]);
  });

  it("lists the files of unproposed work the withdrawal replaces", async () => {
    stubHarnessServer({
      read: { body: MERGED },
      releaseWithdrawalCheck: {
        body: {
          files: [".apm/skills/code-review/SKILL.md"],
          confirmation: "token-1",
        },
      },
    });
    renderHarness();

    const dialog = await openWithdrawal();

    expect(
      await within(dialog).findByText("Changes not yet proposed"),
    ).toBeVisible();
    expect(
      within(dialog).getByText(".apm/skills/code-review/SKILL.md"),
    ).toBeVisible();
  });

  it("sends the confirmation it was given, then selects the row under Pending proposal", async () => {
    const withdrawals: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: MERGED, afterPromote: WITHDRAWN },
      releaseWithdrawal: { body: { name: "code-review" } },
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
        { type: "skill", name: "code-review", confirmation: "token-1" },
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const pane = await screen.findByRole("complementary", {
      name: "code-review detail",
    });
    await waitFor(() =>
      expect(
        within(pane).getByRole("button", { name: "Propose change" }),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(harnessRegion()).toHaveTextContent(
        "Withdrew code-review from release.",
      ),
    );
  });

  it("selects the old name's row under Pending proposal after withdrawing a rename", async () => {
    // tdd was renamed to testing and merged; the withdrawal brings tdd back
    // and leaves two proposals: testing removed, tdd added.
    const RENAMED: HarnessState = withStages(ON_DISK, {
      release: [
        row("pending-release", "testing", "not-yet-released", {
          onDisk: true,
          change: "rename",
          previousName: "tdd",
        }),
      ],
    });
    const RENAME_WITHDRAWN: HarnessState = withStages(ON_DISK, {
      proposal: [
        row("pending-proposal", "testing", "not-yet-proposed", {
          change: "deletion",
          alsoIn: ["pending-release"],
        }),
        row("pending-proposal", "tdd", "not-yet-proposed", {
          onDisk: true,
          change: "addition",
          remoteTree: "remote-tdd",
        }),
      ],
      release: [
        row("pending-release", "testing", "not-yet-released", {
          change: "rename",
          previousName: "tdd",
          alsoIn: ["pending-proposal"],
        }),
      ],
    });
    const withdrawals: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: RENAMED, afterPromote: RENAME_WITHDRAWN },
      releaseWithdrawal: { body: { name: "tdd" } },
      releaseWithdrawals: withdrawals,
    });
    renderHarness();
    const menu = await openRowMenu("testing", "Pending release");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Withdraw from release" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Withdraw testing from release",
    });
    await waitFor(() =>
      expect(confirmButton(dialog)).not.toHaveAttribute("aria-disabled"),
    );

    await userEvent.click(confirmButton(dialog));

    await waitFor(() =>
      expect(withdrawals).toEqual([
        { type: "skill", name: "testing", confirmation: "token-1" },
      ]),
    );
    const pane = await screen.findByRole("complementary", {
      name: "tdd detail",
    });
    expect(within(pane).getByText("Pending proposal")).toBeInTheDocument();
    const current = document.querySelectorAll('tr[aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("tdd");
  });

  it("states a refusal in the dialog and keeps the confirmation standing", async () => {
    stubHarnessServer({
      read: { body: MERGED },
      releaseWithdrawal: { body: { error: "confirmation-stale" }, status: 409 },
    });
    renderHarness();
    const dialog = await openWithdrawal();
    await waitFor(() =>
      expect(confirmButton(dialog)).not.toHaveAttribute("aria-disabled"),
    );

    await userEvent.click(confirmButton(dialog));

    expect(
      await within(dialog).findByText("Confirmation out of date"),
    ).toBeVisible();
    expect(
      screen.getByRole("dialog", { name: "Withdraw code-review from release" }),
    ).toBeInTheDocument();
  });

  it("names the pull request to merge once a refusal reads it open", async () => {
    stubHarnessServer({
      read: { body: MERGED },
      releaseWithdrawal: {
        body: { error: "proposal-open" },
        status: 409,
        thenRead: withStages(ON_DISK, {
          release: [
            row("pending-release", "code-review", "not-yet-released", {
              onDisk: true,
              openRequests: [52],
            }),
          ],
        }),
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
          "Nothing was withdrawn. Merge pull request #52 on GitHub, or select Withdraw proposal.",
        ),
      ),
    ).toBeVisible();
  });

  it("states a refused check in the dialog and offers no confirmation", async () => {
    stubHarnessServer({
      read: { body: MERGED },
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
    expect(confirmButton(dialog)).toHaveAttribute("aria-disabled", "true");
  });

  it("works by keyboard alone", async () => {
    const withdrawals: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: MERGED, afterPromote: WITHDRAWN },
      releaseWithdrawal: { body: { name: "code-review" } },
      releaseWithdrawals: withdrawals,
    });
    renderHarness();
    const actions = await screen.findByRole("button", {
      name: "Actions for code-review skill in Pending release",
    });
    actions.focus();

    await userEvent.keyboard("{Enter}");
    const item = await screen.findByRole("menuitem", {
      name: "Withdraw from release",
    });
    await waitFor(() => expect(item).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", {
      name: "Withdraw code-review from release",
    });
    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Cancel" }),
      ).toHaveFocus(),
    );
    await waitFor(() =>
      expect(confirmButton(dialog)).not.toHaveAttribute("aria-disabled"),
    );
    await userEvent.tab();
    expect(confirmButton(dialog)).toHaveFocus();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => expect(withdrawals).toHaveLength(1));
  });

  describe("while the item has an open proposal", () => {
    const blockedBy = (openRequests: number[] | null): HarnessState =>
      withStages(ON_DISK, {
        release: [
          row("pending-release", "code-review", "not-yet-released", {
            onDisk: true,
            openRequests,
          }),
        ],
      });

    const paneButton = async () =>
      within(await openPane("code-review", "Pending release")).getByRole(
        "button",
        { name: "Withdraw from release" },
      );

    it("blocks the menu item without a cause", async () => {
      stubHarnessServer({ read: { body: blockedBy([52]) } });
      renderHarness();

      const menu = await openRowMenu("code-review", "Pending release");
      const item = within(menu).getByRole("menuitem", {
        name: "Withdraw from release",
      });

      expect(item).toHaveAttribute("aria-disabled", "true");
      expect(item).not.toHaveAccessibleDescription();
    });

    it("blocks the pane-foot button and names the pull request to merge", async () => {
      stubHarnessServer({ read: { body: blockedBy([52]) } });
      renderHarness();

      expectTooltipCause(
        await paneButton(),
        "Merge pull request #52 on GitHub, or select Withdraw proposal.",
      );
    });

    it("blocks while the pull request read is unknown", async () => {
      stubHarnessServer({ read: { body: blockedBy(null) } });
      renderHarness();

      expectTooltipCause(
        await paneButton(),
        "Select Re-read Harness to read GitHub again.",
      );
    });

    it("opens no dialog from the blocked button", async () => {
      const withdrawals: Record<string, unknown>[] = [];
      stubHarnessServer({
        read: { body: blockedBy([52]) },
        releaseWithdrawals: withdrawals,
      });
      renderHarness();

      await userEvent.click(await paneButton());

      expect(
        screen.queryByRole("dialog", {
          name: "Withdraw code-review from release",
        }),
      ).toBeNull();
    });
  });
});
