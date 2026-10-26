import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sentence } from "../test-utils";
import {
  harnessRegion,
  installHarnessHooks,
  ON_DISK,
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
});
