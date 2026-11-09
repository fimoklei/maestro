import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectTooltipCause, focusByKeyboard } from "../test-utils";
import {
  harnessGrid,
  installHarnessHooks,
  RELEASED,
  renderHarness,
  row,
  stageHeader,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";
import { pullRequest } from "./stage-row-fixture";

installHarnessHooks();

const theirs = {
  ...pullRequest(198, "lint-fix"),
  author: "mvdberg",
  byOther: true,
};

// Every kind a batch may carry, one waiting row, and rows in the later stages.
const MIXED = withStages(RELEASED, {
  proposal: [
    row("pending-proposal", "code-review", "not-yet-proposed", {
      change: "addition",
    }),
    row("pending-proposal", "release-notes", "not-yet-proposed", {
      type: "prompt",
      path: ".maestro/prompts/release-notes.md",
      change: "addition",
    }),
    row("pending-proposal", "old-deploy", "not-yet-proposed", {
      change: "deletion",
    }),
    // An open proposal of the author's own: the batch updates it.
    row("pending-proposal", "tdd", "new-local-work", {
      requests: [pullRequest(12)],
    }),
    row("pending-proposal", "lint-fix", "not-yet-proposed", {
      requests: [theirs],
      waitingOn: "mvdberg",
    }),
  ],
  review: [row("pending-review", "caveman", "waiting-for-review")],
  release: [row("pending-release", "planner", "not-yet-released")],
});

const box = (name: string, noun: "skill" | "prompt" = "skill") =>
  screen.getByRole("checkbox", { name: `Select ${name} ${noun}` });
const selectAll = () =>
  screen.getByRole("checkbox", { name: "Select all under Pending proposal" });
const selectionBar = () => screen.queryByRole("group", { name: /selected$/ });

async function openMixed() {
  stubHarnessServer({ read: { body: MIXED } });
  renderHarness();
  await screen.findByRole("checkbox", { name: "Select code-review skill" });
}

describe("selecting rows under Pending proposal", () => {
  it("gives only the rows under Pending proposal a checkbox", async () => {
    await openMixed();

    const grid = await harnessGrid();
    // Five proposal rows plus the group's select-all; none for review or release.
    expect(within(grid).getAllByRole("checkbox")).toHaveLength(6);
    expect(
      screen.queryByRole("checkbox", { name: /caveman|planner/ }),
    ).toBeNull();
  });

  it("selects skills, prompts, deletions and rows with an open proposal alike", async () => {
    await openMixed();

    await userEvent.click(box("code-review"));
    await userEvent.click(box("release-notes", "prompt"));
    await userEvent.click(box("old-deploy"));
    await userEvent.click(box("tdd"));

    for (const each of [
      box("code-review"),
      box("release-notes", "prompt"),
      box("old-deploy"),
      box("tdd"),
    ]) {
      expect(each).toBeChecked();
    }
    expect(selectionBar()).toHaveAccessibleName("4 selected");
  });

  it("ticks every selectable row from the group row, and clears them from the bar", async () => {
    await openMixed();

    expect(
      within(await stageHeader("Pending proposal")).getByRole("checkbox"),
    ).toBe(selectAll());
    await userEvent.click(selectAll());

    expect(selectAll()).toBeChecked();
    expect(selectionBar()).toHaveAccessibleName("4 selected");
    expect(box("lint-fix")).not.toBeChecked();

    await userEvent.click(
      within(selectionBar() as HTMLElement).getByRole("button", {
        name: "Clear selection",
      }),
    );
    expect(box("code-review")).not.toBeChecked();
    expect(selectionBar()).toBeNull();
  });

  it("shows the group checkbox as partly checked while some rows are", async () => {
    await openMixed();

    await userEvent.click(box("code-review"));

    expect(selectAll()).toBePartiallyChecked();
  });

  it("keeps a row that waits on another contributor unticked, with the wait sentence as its cause", async () => {
    await openMixed();

    expectTooltipCause(
      box("lint-fix"),
      "mvdberg has pull request #198 open for this skill. Wait until it is merged or closed.",
    );
    await userEvent.click(box("lint-fix"));

    expect(box("lint-fix")).not.toBeChecked();
    expect(selectionBar()).toBeNull();
  });

  it("badges a row that waits on another contributor with who proposed it", async () => {
    await openMixed();

    const waiting = screen.getByRole("row", { name: /lint-fix/ });
    expect(within(waiting).getByText("Proposed by mvdberg")).toBeVisible();
    expect(within(waiting).queryByText("Not yet proposed")).toBeNull();
  });

  it("checks a row from the keyboard, but never the waiting one", async () => {
    await openMixed();
    const grid = await harnessGrid();
    focusByKeyboard(grid);

    // code-review leads; the waiting lint-fix row is the fifth.
    await userEvent.keyboard(" ");
    expect(box("code-review")).toBeChecked();

    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown} ");
    expect(box("lint-fix")).not.toBeChecked();

    await userEvent.keyboard("{Control>}a{/Control}");
    expect(selectionBar()).toHaveAccessibleName("4 selected");
    expect(box("lint-fix")).not.toBeChecked();
  });

  it("keeps the selection through a re-read and a folded group", async () => {
    await openMixed();
    await userEvent.click(box("code-review"));
    await userEvent.click(box("release-notes", "prompt"));

    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Harness" }),
    );
    // A pressed re-read shows skeleton rows until it lands.
    await userEvent.click(
      await screen.findByRole("button", { name: "Collapse Pending proposal" }),
    );
    expect(selectionBar()).toHaveAccessibleName("2 selected");
    await userEvent.click(
      screen.getByRole("button", { name: "Expand Pending proposal" }),
    );

    expect(box("code-review")).toBeChecked();
    expect(box("release-notes", "prompt")).toBeChecked();
    expect(box("old-deploy")).not.toBeChecked();
  });

  it("drops a row from the selection once a re-read finds it waiting", async () => {
    let read = MIXED;
    stubHarnessServer({
      read: {
        get body() {
          return read;
        },
      },
    });
    renderHarness();
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Select code-review skill" }),
    );
    await userEvent.click(box("tdd"));

    read = withStages(RELEASED, {
      proposal: [
        row("pending-proposal", "code-review", "not-yet-proposed", {
          change: "addition",
          requests: [theirs],
          waitingOn: "mvdberg",
        }),
        row("pending-proposal", "tdd", "new-local-work", {
          requests: [pullRequest(12)],
        }),
      ],
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Harness" }),
    );

    expect(await screen.findByRole("group", { name: "1 selected" })).toBe(
      selectionBar(),
    );
    expect(
      await screen.findByRole("checkbox", { name: "Select code-review skill" }),
    ).not.toBeChecked();
    expect(box("tdd")).toBeChecked();
  });
});
