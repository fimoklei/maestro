import type { HarnessStageRow, StageStatus } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { openFootMenu, sentence } from "../test-utils";
import {
  installHarnessHooks,
  ON_DISK,
  openPane,
  openRowMenu,
  renderHarness,
  row,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";
import { pullRequest } from "./stage-row-fixture";

installHarnessHooks();

// A prompt row's actions sit where a skill's sit in the same stage, under the
// prompt's own labels and words.

const prompt = (
  stage: HarnessStageRow["stage"],
  status: StageStatus,
  over: Partial<HarnessStageRow> = {},
): HarnessStageRow =>
  row(stage, "pr-review", status, {
    type: "prompt",
    path: ".maestro/prompts/pr-review.md",
    branch: "maestro/prompt.pr-review",
    ...over,
  });

const labels = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.textContent);

const danger = (menu: HTMLElement) =>
  within(menu)
    .getAllByRole("menuitem")
    .filter((item) => item.classList.contains("text-red-11"))
    .map((item) => item.textContent);

const inClone = (uncommitted: boolean) => [
  {
    body: {
      skill: {},
      prompt: {
        "pr-review": {
          inClone: true,
          path: ".maestro/prompts/pr-review.md",
          workingTree: "blob-1",
          uncommitted,
          localOnly: false,
        },
      },
    },
  },
];

describe("a prompt row on the Harness screen", () => {
  const RELEASE_ROW = prompt("pending-release", "not-yet-released", {
    requests: [pullRequest(45, "prompt.pr-review")],
    onDisk: true,
  });

  // Withdraw from release takes Delete prompt's place there (#1642).
  it("puts Withdraw from release behind a divider in the Pending release menu", async () => {
    stubHarnessServer({
      read: { body: withStages(ON_DISK, { release: [RELEASE_ROW] }) },
    });
    renderHarness();

    const menu = await openRowMenu("pr-review", "Pending release", "prompt");

    expect(labels(menu)).toEqual([
      "View pull request",
      "Edit prompt",
      "Withdraw from release",
    ]);
    expect(danger(menu)).toEqual(["Withdraw from release"]);
    // One after the link, one before the danger item.
    expect(within(menu).getAllByRole("separator")).toHaveLength(2);
    expect(
      within(menu).getByRole("menuitem", { name: "Withdraw from release" })
        .previousElementSibling,
    ).toHaveAttribute("role", "separator");
  });

  it("puts Withdraw from release behind ⋯ at the pane foot", async () => {
    stubHarnessServer({
      read: { body: withStages(ON_DISK, { release: [RELEASE_ROW] }) },
    });
    renderHarness();

    const pane = await openPane("pr-review", "Pending release");
    const foot = await openFootMenu(pane, "pr-review");

    expect(
      foot.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Withdraw from release"]);
  });

  it("opens the Delete prompt dialog in the prompt's words", async () => {
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          proposal: [
            prompt("pending-proposal", "not-yet-proposed", {
              remoteTree: "remote-blob",
              onDisk: true,
            }),
          ],
        }),
      },
      deletionChecks: inClone(true),
    });
    renderHarness();

    const menu = await openRowMenu("pr-review", "Pending proposal", "prompt");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /^delete prompt$/i }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete pr-review",
    });

    await waitFor(() =>
      expect(
        within(dialog).getByRole("button", { name: /^delete prompt/i }),
      ).not.toHaveAttribute("aria-disabled"),
    );
    expect(
      within(dialog).getByText(
        sentence(
          "Delete prompt removes the pr-review file from your clone of fimoklei/agent-harness. The prompt stays in fimoklei/agent-harness.",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        sentence(
          "To also delete it from fimoklei/agent-harness, select Propose change.",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(".maestro/prompts/pr-review.md"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Uncommitted changes in pr-review"),
    ).toBeInTheDocument();
  });

  it("offers Restore prompt on a prompt deleted locally, and opens it in the prompt's words", async () => {
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          proposal: [
            prompt("pending-proposal", "not-yet-proposed", {
              change: "deletion",
              remoteTree: "remote-blob",
              restorable: true,
            }),
          ],
        }),
      },
    });
    renderHarness();

    const menu = await openRowMenu("pr-review", "Pending proposal", "prompt");
    expect(labels(menu).at(-1)).toBe("Restore prompt");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /^restore prompt$/i }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Restore pr-review",
    });

    expect(
      within(dialog).getByText(
        sentence(
          "Restore prompt brings back the file from your last local commit. Later changes do not come back.",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /^restore prompt/i }),
    ).toBeInTheDocument();
  });
});
