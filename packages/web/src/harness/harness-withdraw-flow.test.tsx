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
      "This replaces the skill folder in your clone with its copy in the next release. You cannot recover your changes. It closes the pull request and deletes the proposal branch. Deployed copies remain unchanged.",
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

  it("warns, keeps the action enabled and still withdraws, when the files could not be compared", async () => {
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
    expect(
      within(dialog).getByRole("button", { name: "Withdraw proposal" }),
    ).not.toHaveAttribute("aria-disabled");
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
      "The pull request is closed. Your skill folder matches its copy in the next release.",
    );
  });

  describe("without an open pull request (#1639)", () => {
    const MISSING = withStages(CONNECTED, {
      review: [row("pending-review", "tdd", "pull-request-missing")],
    });
    const settledDialog = async () => {
      const dialog = await openWithdrawal();
      await waitFor(() =>
        expect(dialog).not.toHaveTextContent(
          "Checking for changes not yet proposed…",
        ),
      );
      return dialog;
    };

    it("states that the folder and the branch go, and names no pull request", async () => {
      stubHarnessServer({ read: { body: MISSING } });
      renderHarness();

      const dialog = await openWithdrawal();

      expect(dialog).toHaveTextContent(
        "This replaces the skill folder in your clone with its copy in the next release. You cannot recover your changes. It deletes the proposal branch. Deployed copies remain unchanged.",
      );
      expect(within(dialog).queryByText("Pull request")).toBeNull();
    });

    it("withdraws with no number and confirms it in a toast once the row is gone", async () => {
      const proposals: { action: string; body: Record<string, unknown> }[] = [];
      stubHarnessServer({
        read: { body: MISSING, afterPromote: GONE },
        proposals,
      });
      renderHarness();
      const dialog = await settledDialog();

      await confirm(dialog);

      await waitFor(() =>
        expect(proposals).toEqual([
          {
            action: "withdraw",
            body: { type: "skill", name: "tdd", number: null },
          },
        ]),
      );
      expect(
        await screen.findByText(sentence("Withdrew tdd.")),
      ).toBeInTheDocument();
    });

    it("lists the files whose changes were never proposed", async () => {
      stubHarnessServer({
        read: { body: MISSING },
        withdrawCheck: { body: { files: ["SKILL.md"] } },
      });
      renderHarness();

      const dialog = await openWithdrawal();

      expect(
        await within(dialog).findByText("Changes not yet proposed"),
      ).toBeVisible();
      expect(within(dialog).getByText("SKILL.md")).toBeVisible();
    });

    it("names no closed pull request when only the branch deletion failed", async () => {
      stubHarnessServer({
        read: { body: MISSING },
        proposal: { body: { error: "branch-delete-failed" }, status: 502 },
      });
      renderHarness();
      const dialog = await settledDialog();

      await confirm(dialog);

      expect(
        await within(dialog).findByText("Proposal branch not deleted"),
      ).toBeVisible();
      expect(dialog).toHaveTextContent("Delete maestro/tdd on GitHub.");
      expect(dialog).toHaveTextContent(
        "Your skill folder matches its copy in the next release.",
      );
      expect(dialog).not.toHaveTextContent("The pull request is closed.");
    });

    it.each([
      [
        "branch-by-other",
        "Another contributor's commits",
        "Only their author can withdraw the proposal. Select Re-read Harness to read GitHub again.",
        "A commit on the proposal branch has another author email.",
      ],
      [
        "commit-email-missing",
        "Git email not set",
        "Set user.email in your clone, then select Withdraw proposal again.",
        null,
      ],
      [
        "branch-authors-unknown",
        "Branch authors not checked",
        "Select Re-read Harness, then select Withdraw proposal again.",
        "Maestro could not compare the proposal branch's commit authors with user.email.",
      ],
    ])(
      "states a refusal over the branch's authors (%s) in the dialog",
      async (error, label, message, detail) => {
        stubHarnessServer({
          read: { body: MISSING },
          proposal: { body: { error }, status: 409 },
        });
        renderHarness();
        const dialog = await settledDialog();

        await confirm(dialog);

        expect(await within(dialog).findByText(label)).toBeVisible();
        expect(dialog).toHaveTextContent(message);
        if (detail !== null) {
          expect(dialog).toHaveTextContent(detail);
        }
      },
    );
  });
});
