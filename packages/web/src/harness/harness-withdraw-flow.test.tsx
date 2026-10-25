import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sentence } from "../test-utils";
import {
  installHarnessHooks,
  RELEASED,
  renderHarness,
  row,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";
import { pullRequest } from "./stage-row-fixture";

installHarnessHooks();

describe("withdrawing a proposal", () => {
  const CONNECTED: HarnessState = {
    ...RELEASED,
    freshness: {
      outcome: "fetched",
      lastFetchedAt: "2026-08-03T11:56:00.000Z",
    },
  };
  const IN_REVIEW = withStages(CONNECTED, {
    review: [
      row("pending-review", "tdd", "waiting-for-review", {
        requests: [pullRequest(45)],
      }),
    ],
  });
  const GONE = withStages(CONNECTED, {});

  const openWithdrawal = async () => {
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Actions for tdd skill in Pending review",
      }),
    );
    await userEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", {
        name: /^withdraw proposal$/i,
      }),
    );
    return screen.findByRole("dialog");
  };
  const confirm = (dialog: HTMLElement) =>
    userEvent.click(
      within(dialog).getByRole("button", { name: "Withdraw proposal" }),
    );

  it("states that the folder, the pull request and the branch all go", async () => {
    stubHarnessServer({ read: { body: IN_REVIEW } });
    renderHarness();

    const dialog = await openWithdrawal();

    expect(dialog).toHaveTextContent(
      "This replaces the skill folder in your clone with its copy on main. You cannot recover your changes. It closes the pull request and deletes the proposal branch. Deployed copies remain unchanged.",
    );
  });

  it("lists the files whose changes were never proposed", async () => {
    stubHarnessServer({
      read: { body: IN_REVIEW },
      withdrawCheck: { body: { files: ["SKILL.md", "references/notes.md"] } },
    });
    renderHarness();

    const dialog = await openWithdrawal();

    const notice = await within(dialog).findByText("Changes not yet proposed");
    expect(dialog).toHaveTextContent(
      "Withdraw proposal discards the changes in these files. To keep them, copy them outside your clone first.",
    );
    expect(within(dialog).getByText("SKILL.md")).toBeVisible();
    expect(within(dialog).getByText("references/notes.md")).toBeVisible();
    expect(notice).toBeVisible();
  });

  it("names no files when every change was proposed", async () => {
    stubHarnessServer({ read: { body: IN_REVIEW } });
    renderHarness();

    const dialog = await openWithdrawal();

    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: "Withdraw proposal" }),
      ).not.toHaveAttribute("aria-disabled", "true"),
    );
    expect(within(dialog).queryByText("Changes not yet proposed")).toBeNull();
    expect(within(dialog).queryByText("Changes not checked")).toBeNull();
  });

  it("holds the withdrawal until the file check answers", async () => {
    let answer = () => {};
    const proposals: { action: string; body: Record<string, unknown> }[] = [];
    stubHarnessServer({
      read: { body: IN_REVIEW },
      withdrawCheck: {
        body: { files: [] },
        heldUntil: new Promise<void>((resolve) => (answer = resolve)),
      },
      proposals,
    });
    renderHarness();

    const dialog = await openWithdrawal();

    expect(dialog).toHaveTextContent("Checking for changes not yet proposed…");
    await confirm(dialog);
    expect(proposals).toEqual([]);
    answer();
    await waitFor(() =>
      expect(dialog).not.toHaveTextContent(
        "Checking for changes not yet proposed…",
      ),
    );
  });

  it("warns, and still withdraws, when the files could not be compared", async () => {
    const proposals: { action: string; body: Record<string, unknown> }[] = [];
    stubHarnessServer({
      read: { body: IN_REVIEW },
      withdrawCheck: { body: { error: "no-answer" }, status: 409 },
      proposals,
    });
    renderHarness();

    const dialog = await openWithdrawal();

    expect(
      await within(dialog).findByText("Changes not checked"),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(
      "Withdraw proposal discards any change you made after proposing. To keep them, copy them outside your clone first.",
    );
    await confirm(dialog);
    await waitFor(() =>
      expect(proposals).toEqual([
        {
          action: "withdraw",
          body: { type: "skill", name: "tdd", number: 45 },
        },
      ]),
    );
  });

  it("closes the dialog and confirms the withdrawal in a toast once the row is gone", async () => {
    stubHarnessServer({ read: { body: IN_REVIEW, afterPromote: GONE } });
    renderHarness();
    const dialog = await openWithdrawal();
    await waitFor(() =>
      expect(dialog).not.toHaveTextContent(
        "Checking for changes not yet proposed…",
      ),
    );

    await confirm(dialog);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      await screen.findByText(sentence("Withdrew tdd.")),
    ).toBeInTheDocument();
  });

  it("names the branch left on GitHub when only its deletion failed", async () => {
    stubHarnessServer({
      read: { body: IN_REVIEW },
      proposal: { body: { error: "branch-delete-failed" }, status: 502 },
    });
    renderHarness();
    const dialog = await openWithdrawal();
    await waitFor(() =>
      expect(dialog).not.toHaveTextContent(
        "Checking for changes not yet proposed…",
      ),
    );

    await confirm(dialog);

    expect(
      await within(dialog).findByText("Proposal branch not deleted"),
    ).toBeVisible();
    expect(dialog).toHaveTextContent("Delete maestro/tdd on GitHub.");
    expect(dialog).toHaveTextContent(
      "The pull request is closed. Your skill folder matches its copy on main.",
    );
  });
});
