import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sentence } from "../test-utils";
import {
  installHarnessHooks,
  ON_DISK,
  openRowMenu,
  promoteRow,
  renderHarness,
  row,
  stageRows,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";
import { pullRequest } from "./stage-row-fixture";

installHarnessHooks();

describe("Harness deletion proposal", () => {
  // A deletion never publishes by a single press: the confirmation states what
  // will be removed and carries the origin/HEAD tree the row was painted from,
  // so a remote that moved under it refuses rather than removes (#580).
  const DELETED: HarnessState = withStages(ON_DISK, {
    proposal: [
      row("pending-proposal", "old-skill", "not-yet-proposed", {
        change: "deletion",
        remoteTree: "abc123",
      }),
      row("pending-proposal", "code-review", "not-yet-proposed"),
    ],
  });

  const REMOVED = {
    branch: "maestro/old-skill",
    pullRequestUrl:
      "https://github.com/fimoklei/agent-harness/compare/main...maestro/old-skill?expand=1",
  };

  const openDeletionConfirmation = async () => {
    await promoteRow("old-skill");
    return screen.findByRole("dialog", { name: /delete old-skill/i });
  };

  it("leaves the deletion confirmation unfilled", async () => {
    stubHarnessServer({ read: { body: DELETED }, deletion: { body: REMOVED } });
    renderHarness();

    const dialog = await openDeletionConfirmation();

    expect(
      within(dialog).getByRole("button", { name: /^delete skill$/i }),
    ).not.toHaveClass("bg-amber-11");
  });

  it("confirms a deletion in the Harness's own words, never Remove", async () => {
    stubHarnessServer({ read: { body: DELETED }, deletion: { body: REMOVED } });
    renderHarness();

    const dialog = await openDeletionConfirmation();

    expect(
      within(dialog).getByRole("button", { name: /^delete skill$/i }),
    ).toBeVisible();
    // Remove names a target's deployed copy, so only the targets' sentence
    // may use it (#1370).
    const targets = "select Update target on each target to remove it.";
    expect(dialog.textContent ?? "").toContain(targets);
    expect((dialog.textContent ?? "").replace(targets, "")).not.toMatch(
      /remov/i,
    );
  });

  it("names who opened the open pull request the deletion replaces", async () => {
    const overOpenRequest = withStages(ON_DISK, {
      proposal: [
        row("pending-proposal", "old-skill", "not-yet-proposed", {
          change: "deletion",
          remoteTree: "abc123",
          requests: [pullRequest(45, "old-skill")],
        }),
      ],
    });
    stubHarnessServer({
      read: { body: overOpenRequest },
      deletion: { body: REMOVED },
    });
    renderHarness();

    const dialog = await openDeletionConfirmation();

    expect(
      within(dialog).getByText(
        "Pull request #45 will delete old-skill instead",
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        sentence(/^fimoklei opened it to propose changes/),
      ),
    ).toBeVisible();
  });

  it("asks for a confirmation on a deletion, and pushes nothing until it is given", async () => {
    const deletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: DELETED },
      deletion: { body: REMOVED },
      deletions,
    });
    renderHarness();

    const dialog = await openDeletionConfirmation();

    expect(within(dialog).getAllByText("old-skill").length).toBeGreaterThan(0);
    expect(deletions).toEqual([]);
  });

  it("carries the origin/HEAD tree the row was shown into the confirmation", async () => {
    const deletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: DELETED },
      deletion: { body: REMOVED },
      deletions,
    });
    renderHarness();
    const dialog = await openDeletionConfirmation();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete skill$/i }),
    );

    await waitFor(() =>
      expect(deletions).toEqual([
        { name: "old-skill", seenRemoteTree: "abc123" },
      ]),
    );
  });

  it("announces the deletion with the delete verb, busy and done", async () => {
    let answer = () => {};
    const held = new Promise<void>((resolve) => {
      answer = resolve;
    });
    stubHarnessServer({
      read: { body: DELETED },
      deletion: { body: REMOVED, heldUntil: held },
    });
    renderHarness();
    const dialog = await openDeletionConfirmation();
    // The open dialog hides the page, its status region included.
    const announced = () =>
      screen
        .getAllByRole("status", { hidden: true })
        .find((region) => region.classList.contains("sr-only"));

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete skill$/i }),
    );

    await waitFor(() => expect(announced()).toHaveTextContent("Deleting…"));
    answer();
    await waitFor(() =>
      expect(announced()).toHaveTextContent("Deleted old-skill."),
    );
  });

  it("moves the confirmed row to Pending review as a deletion", async () => {
    stubHarnessServer({
      read: {
        body: DELETED,
        afterPromote: withStages(DELETED, {
          review: [
            row("pending-review", "old-skill", "pull-request-missing", {
              change: "deletion",
            }),
          ],
        }),
      },
      deletion: { body: REMOVED },
    });
    renderHarness();
    const dialog = await openDeletionConfirmation();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete skill$/i }),
    );

    await waitFor(async () =>
      expect(
        (await stageRows("Pending review")).map((each) => each.textContent),
      ).toEqual([expect.stringMatching(/old-skill.*Pull request missing/)]),
    );
  });

  it("sends a skill restored after a proposed deletion through Update proposal", async () => {
    // The file is back on disk while the branch still proposes deleting it:
    // work to send, and no confirmation stands between it and the push (#847).
    const promotions: Record<string, unknown>[] = [];
    const deletions: Record<string, unknown>[] = [];
    const request = pullRequest(45);
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          proposal: [
            row("pending-proposal", "old-skill", "new-local-work", {
              requests: [request],
              comparison: { kind: "proposal", number: 45 },
            }),
          ],
          review: [
            row("pending-review", "old-skill", "waiting-for-review", {
              change: "deletion",
              requests: [request],
            }),
          ],
        }),
      },
      promote: { body: REMOVED },
      promotions,
      deletion: { body: REMOVED },
      deletions,
    });
    renderHarness();

    const menu = await openRowMenu("old-skill");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /^update proposal$/i }),
    );

    await waitFor(() => expect(promotions).toEqual([{ name: "old-skill" }]));
    expect(deletions).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("states a refused confirmation in the dialog, and asks for a new one", async () => {
    const deletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: DELETED },
      deletion: {
        body: {
          error: "confirmation-stale",
          message:
            "The copy on the default branch moved after this confirmation. Nothing was pushed — select Retry check, then Delete skill again.",
        },
        status: 409,
        retry: { body: REMOVED },
      },
      deletions,
    });
    renderHarness();
    const dialog = await openDeletionConfirmation();
    const confirm = within(dialog).getByRole("button", {
      name: /^delete skill$/i,
    });

    await userEvent.click(confirm);

    expect(
      await within(dialog).findByText(/Delete skill again/i),
    ).toBeInTheDocument();
    // The dialog stays open with the press still there: a refusal changed
    // nothing, so the way forward is another confirmation.
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);

    await waitFor(() => expect(deletions).toHaveLength(2));
  });

  it("states an ambiguous working tree in the dialog, without publishing anything", async () => {
    stubHarnessServer({
      read: { body: DELETED },
      deletion: {
        body: {
          error: "merge-in-progress",
        },
        status: 409,
      },
    });
    renderHarness();
    const dialog = await openDeletionConfirmation();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete skill$/i }),
    );

    expect(
      await within(dialog).findByText(/a half-merged working tree/i),
    ).toBeInTheDocument();
  });

  it("closes the confirmation without publishing when it is dismissed", async () => {
    const deletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: DELETED },
      deletion: { body: REMOVED },
      deletions,
    });
    renderHarness();
    const dialog = await openDeletionConfirmation();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^cancel$/i }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /delete old-skill/i }),
      ).toBeNull(),
    );
    expect(deletions).toEqual([]);
  });
});
