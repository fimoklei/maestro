import type { HarnessStageRow, HarnessState, StageStatus } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { focusByKeyboard, sentence } from "../test-utils";
import {
  installHarnessHooks,
  openPane,
  openRowMenu,
  RELEASED,
  renderHarness,
  stageRows,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";
import { pullRequest, stageRow } from "./stage-row-fixture";

installHarnessHooks();

const CONNECTED: HarnessState = {
  ...RELEASED,
  freshness: {
    outcome: "fetched",
    lastFetchedAt: "2026-08-03T11:56:00.000Z",
  },
};

// The row as the server sends it: the list's name is its type.
const listRow = (
  status: StageStatus,
  over: Partial<HarnessStageRow> = {},
): HarnessStageRow =>
  stageRow("pending-review", "categories", status, {
    type: "categories",
    path: ".maestro/categories.yml",
    branch: "maestro/list.categories",
    requests: [pullRequest(45, "list.categories")],
    ...over,
  });

const showing = (row: HarnessStageRow) =>
  stubHarnessServer({
    read: { body: withStages(CONNECTED, { review: [row] }) },
  });

const settled = async () => {
  const reread = await screen.findByRole("button", {
    name: "Re-read Harness",
  });
  await waitFor(() => expect(reread).not.toHaveAttribute("aria-busy"));
};

const menuLabels = async () =>
  within(await openRowMenu("Categories", "Pending review", "categories"))
    .getAllByRole("menuitem")
    .map((item) => item.textContent);

describe("the Categories row under Pending review", () => {
  it("reads Name Categories, Type List and Change Changed", async () => {
    showing(listRow("waiting-for-review", { change: "edit" }));
    renderHarness();

    const [row] = await stageRows("Pending review");

    expect(row).toHaveTextContent("Categories");
    expect(row).toHaveTextContent("List");
    expect(row).toHaveTextContent("Changed");
  });

  it("reads Added where the next release holds no categories file", async () => {
    showing(listRow("waiting-for-review", { change: "addition" }));
    renderHarness();

    const [row] = await stageRows("Pending review");

    expect(row).toHaveTextContent("Added");
  });

  it("states what the change does in the card the keyboard opens", async () => {
    showing(listRow("waiting-for-review", { change: "edit" }));
    renderHarness();
    await stageRows("Pending review");

    focusByKeyboard(screen.getByRole("grid"));

    expect(
      await screen.findByText(
        sentence(
          "This change replaces the categories in github.com/fimoklei/agent-harness with your categories.",
        ),
      ),
    ).toBeInTheDocument();
  });

  it("opens the detail pane with the pull request and its state", async () => {
    showing(listRow("waiting-for-review", { change: "edit" }));
    renderHarness();

    const pane = await openPane("Categories", "Pending review");

    expect(pane).toHaveTextContent("List");
    expect(pane).toHaveTextContent("#45");
    expect(pane).toHaveTextContent(
      "Pull request #45 is open and waiting for a reviewer.",
    );
  });

  it("offers View pull request, Open Categories in Settings and Withdraw proposal", async () => {
    showing(listRow("waiting-for-review"));
    renderHarness();
    await settled();

    expect(await menuLabels()).toEqual([
      "View pull request",
      "Open Categories in Settings",
      "Withdraw proposal",
    ]);
  });

  it("offers no Reopen proposal, Create pull request or Propose change after a close", async () => {
    showing(listRow("proposal-closed"));
    renderHarness();
    await settled();

    expect(await menuLabels()).toEqual([
      "View pull request",
      "Open Categories in Settings",
      "Withdraw proposal",
    ]);
  });

  it("offers no withdrawal of another contributor's pull request", async () => {
    showing(
      listRow("proposed-by-other", {
        waitingOn: "mira",
        requests: [{ ...pullRequest(46), author: "mira", byOther: true }],
      }),
    );
    renderHarness();
    await settled();

    expect(await menuLabels()).toEqual([
      "View pull request",
      "Open Categories in Settings",
    ]);
  });

  it("goes to Categories in Settings and writes nothing", async () => {
    const proposals: { action: string; body: Record<string, unknown> }[] = [];
    stubHarnessServer({
      read: {
        body: withStages(CONNECTED, {
          review: [listRow("waiting-for-review")],
        }),
      },
      proposals,
    });
    renderHarness();
    await settled();

    await userEvent.click(
      within(
        await openRowMenu("Categories", "Pending review", "categories"),
      ).getByRole("menuitem", { name: "Open Categories in Settings" }),
    );

    expect(await screen.findByText("Categories in Settings")).toBeVisible();
    expect(proposals).toEqual([]);
  });

  describe("a pushed branch without a pull request", () => {
    const MISSING = listRow("pull-request-missing", { requests: [] });

    it("reads Pull request missing and sends the contributor to Settings to finish", async () => {
      showing(MISSING);
      renderHarness();

      const pane = await openPane("Categories", "Pending review");

      expect(pane).toHaveTextContent("Pull request missing");
      expect(pane).toHaveTextContent(
        "The proposal branch is on GitHub without a pull request. To open one, open Categories in Settings and select Create pull request.",
      );
    });

    it("offers Open Categories in Settings and Withdraw proposal", async () => {
      showing(MISSING);
      renderHarness();
      await settled();

      expect(await menuLabels()).toEqual([
        "Open Categories in Settings",
        "Withdraw proposal",
      ]);
    });
  });
});

describe("Withdraw proposal on the Categories row", () => {
  const withdrawing = async () => {
    await settled();
    await userEvent.click(
      within(
        await openRowMenu("Categories", "Pending review", "categories"),
      ).getByRole("menuitem", { name: "Withdraw proposal" }),
    );
    return screen.findByRole("dialog", {
      name: "Withdraw proposal for Categories",
    });
  };

  it("states that only the branch goes and the categories stay, checking no files", async () => {
    const calls = stubHarnessServer({
      read: {
        body: withStages(CONNECTED, {
          review: [listRow("pull-request-missing", { requests: [] })],
        }),
      },
    });
    renderHarness();

    const dialog = await withdrawing();

    expect(dialog).toHaveTextContent(
      "This deletes the proposal branch on GitHub. Your categories stay as they are.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Withdraw proposal" }),
    ).not.toHaveAttribute("aria-disabled");
    expect(calls).not.toContain("POST /api/harness/proposal/withdraw/check");
  });

  it("states that the open pull request closes too", async () => {
    showing(listRow("waiting-for-review"));
    renderHarness();

    const dialog = await withdrawing();

    expect(dialog).toHaveTextContent(
      "This closes pull request #45 and deletes the proposal branch on GitHub. Your categories stay as they are.",
    );
  });

  it("withdraws the list by type and number, then says so", async () => {
    const proposals: { action: string; body: Record<string, unknown> }[] = [];
    stubHarnessServer({
      read: {
        body: withStages(CONNECTED, {
          review: [listRow("waiting-for-review")],
        }),
        afterPromote: withStages(CONNECTED, {}),
      },
      proposals,
    });
    renderHarness();
    const dialog = await withdrawing();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Withdraw proposal" }),
    );

    await waitFor(() =>
      expect(proposals).toEqual([
        { action: "withdraw", body: { type: "categories", number: 45 } },
      ]),
    );
    expect(
      await screen.findByText(sentence("Withdrew Categories.")),
    ).toBeInTheDocument();
  });

  it("names the branch left on GitHub, and no clone, when only its deletion failed", async () => {
    stubHarnessServer({
      read: {
        body: withStages(CONNECTED, {
          review: [listRow("waiting-for-review")],
        }),
      },
      proposal: { body: { error: "branch-delete-failed" }, status: 502 },
    });
    renderHarness();
    const dialog = await withdrawing();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Withdraw proposal" }),
    );

    expect(
      await within(dialog).findByText("Proposal branch not deleted"),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(
      "Delete maestro/list.categories on GitHub.",
    );
    expect(dialog).not.toHaveTextContent("folder");
  });
});
