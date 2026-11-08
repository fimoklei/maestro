import type {
  BatchItemOutcome,
  BatchProposal,
  BatchReport,
  PrimitiveRef,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectTooltipCause } from "../test-utils";
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

const PENDING = withStages(RELEASED, {
  proposal: [
    row("pending-proposal", "code-review", "not-yet-proposed", {
      change: "addition",
    }),
    row("pending-proposal", "release-notes", "not-yet-proposed", {
      type: "prompt",
      path: ".maestro/prompts/release-notes.md",
      change: "addition",
    }),
    row("pending-proposal", "tdd", "new-local-work", {
      requests: [pullRequest(12)],
    }),
    row("pending-proposal", "old-deploy", "not-yet-proposed", {
      change: "deletion",
    }),
  ],
});

const CODE_REVIEW: PrimitiveRef = { type: "skill", name: "code-review" };
const RELEASE_NOTES: PrimitiveRef = { type: "prompt", name: "release-notes" };
const TDD: PrimitiveRef = { type: "skill", name: "tdd" };

const proposal = (ref: PrimitiveRef, number: number): BatchProposal => ({
  ...ref,
  branch: `maestro/${ref.type === "prompt" ? "prompt." : ""}${ref.name}`,
  compareUrl: `https://github.com/fimoklei/agent-harness/compare/main...maestro/${ref.name}?expand=1`,
  pullRequest: {
    state: "opened",
    number,
    url: `https://github.com/fimoklei/agent-harness/pull/${number}`,
  },
});

// The stream a batch answers: each item as it finished, then the report.
const streamOf = (report: BatchReport) => [
  ...report.proposed.map((each) => ({
    item: { ok: true, ...each } satisfies BatchItemOutcome,
  })),
  ...report.failed.flatMap(({ error, items }) =>
    items.map((ref) => ({
      item: { ...ref, ok: false, error } satisfies BatchItemOutcome,
    })),
  ),
  { report },
];

// A promise a test opens by hand, to hold one line of the stream.
function deferred() {
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

const box = (name: string, noun: "skill" | "prompt" = "skill") =>
  screen.getByRole("checkbox", { name: `Select ${name} ${noun}` });

const proposeChanges = () =>
  within(screen.getByRole("group", { name: /selected$/ })).getByRole("button", {
    name: "Propose changes",
  });

async function tickThree() {
  await screen.findByRole("checkbox", { name: "Select code-review skill" });
  await userEvent.click(box("code-review"));
  await userEvent.click(box("release-notes", "prompt"));
  await userEvent.click(box("tdd"));
}

describe("proposing several changes from the selection bar", () => {
  it("sends every ticked addition and edit in one request and reports each pull request", async () => {
    const batches: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: PENDING },
      batch: {
        lines: streamOf({
          proposed: [
            proposal(CODE_REVIEW, 101),
            proposal(RELEASE_NOTES, 102),
            proposal(TDD, 12),
          ],
          failed: [],
        }),
      },
      batches,
    });
    renderHarness();
    await tickThree();

    await userEvent.click(proposeChanges());

    const dialog = await screen.findByRole("dialog", {
      name: "Propose 3 changes",
    });
    expect(
      await within(dialog).findByRole("heading", {
        name: "Proposed 3 of 3 changes",
      }),
    ).toBeInTheDocument();
    expect(batches).toHaveLength(1);
    expect(batches[0]?.items).toEqual(
      expect.arrayContaining([CODE_REVIEW, RELEASE_NOTES, TDD]),
    );
    expect(batches[0]?.items).toHaveLength(3);
    const proposed = within(dialog).getByRole("region", {
      name: "Proposed · 3",
    });
    for (const number of [101, 102, 12]) {
      expect(
        within(proposed).getByRole("link", {
          name: `Pull request #${number}, opens in a new tab`,
        }),
      ).toBeInTheDocument();
    }
    expect(within(proposed).getAllByText("Added")).toHaveLength(2);
    expect(within(proposed).getByText("Changed")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Review and merge each pull request on GitHub. Then select Create a release.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the dialog open while the batch runs, then clears the selection once closed", async () => {
    let release: () => void = () => {};
    const heldUntil = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubHarnessServer({
      read: { body: PENDING },
      batch: {
        heldUntil,
        lines: streamOf({
          proposed: [proposal(CODE_REVIEW, 101), proposal(TDD, 12)],
          failed: [],
        }),
      },
    });
    renderHarness();
    await screen.findByRole("checkbox", { name: "Select code-review skill" });
    await userEvent.click(box("code-review"));
    await userEvent.click(box("tdd"));

    await userEvent.click(proposeChanges());

    const dialog = await screen.findByRole("dialog", {
      name: "Propose 2 changes",
    });
    expect(
      within(dialog).getByRole("button", { name: "Proposing…" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("group", { name: "Added · 1" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("group", { name: "Changed · 1" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Close" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBe(dialog);

    release();
    await within(dialog).findByRole("heading", {
      name: "Proposed 2 of 2 changes",
    });
    const footer = within(dialog).getAllByRole("button", { name: "Close" });
    await userEvent.click(footer[footer.length - 1] as HTMLElement);

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("group", { name: /selected$/ })).toBeNull();
  });

  it("fills each row in as its item lands, announcing only the start and the end", async () => {
    const landFirst = deferred();
    const landSecond = deferred();
    const reported = deferred();
    stubHarnessServer({
      read: { body: PENDING },
      batch: {
        lines: streamOf({
          proposed: [proposal(CODE_REVIEW, 101), proposal(TDD, 12)],
          failed: [],
        }),
        gates: [landFirst.promise, landSecond.promise, reported.promise],
      },
    });
    renderHarness();
    await tickThree();

    await userEvent.click(proposeChanges());
    const dialog = await screen.findByRole("dialog", {
      name: "Propose 3 changes",
    });
    expect(
      within(dialog).getByRole("button", { name: "Proposing…" }),
    ).toBeInTheDocument();

    landFirst.open();
    expect(
      await within(dialog).findByRole("link", {
        name: "Pull request #101, opens in a new tab",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("link", {
        name: "Pull request #12, opens in a new tab",
      }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("heading", { name: /^Proposed \d/ }),
    ).toBeNull();
    for (const region of document.querySelectorAll(
      '[role="status"], [aria-live]',
    )) {
      expect(region.textContent).not.toContain("#101");
    }

    landSecond.open();
    expect(
      await within(dialog).findByRole("link", {
        name: "Pull request #12, opens in a new tab",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("heading", { name: /^Proposed \d/ }),
    ).toBeNull();

    reported.open();
    expect(
      await within(dialog).findByRole("heading", {
        name: "Proposed 2 of 3 changes",
      }),
    ).toBeInTheDocument();
  });

  it("collapses identical failures into one line with the items it covers", async () => {
    stubHarnessServer({
      read: { body: PENDING },
      batch: {
        lines: streamOf({
          proposed: [proposal(TDD, 12)],
          failed: [
            { error: "promote-failed", items: [CODE_REVIEW, RELEASE_NOTES] },
          ],
        }),
      },
    });
    renderHarness();
    await tickThree();

    await userEvent.click(proposeChanges());

    const dialog = await screen.findByRole("dialog", {
      name: "Propose 3 changes",
    });
    await within(dialog).findByRole("heading", {
      name: "Proposed 1 of 3 changes",
    });
    const failed = within(dialog).getByRole("region", {
      name: "Not proposed · 2",
    });
    expect(within(failed).getAllByRole("listitem")).toHaveLength(1);
    expect(
      within(failed).getByText("code-review, release-notes"),
    ).toBeInTheDocument();
    expect(within(failed).getByText("Change not proposed")).toBeInTheDocument();
  });

  it("lists a pushed branch without a pull request apart, with its compare page", async () => {
    const pushedOnly = (ref: PrimitiveRef) => ({
      ...proposal(ref, 0),
      pullRequest: { state: "missing" as const },
    });
    stubHarnessServer({
      read: { body: PENDING },
      batch: {
        lines: streamOf({
          proposed: [
            pushedOnly(CODE_REVIEW),
            pushedOnly(RELEASE_NOTES),
            proposal(TDD, 12),
          ],
          failed: [],
        }),
      },
    });
    renderHarness();
    await tickThree();

    await userEvent.click(proposeChanges());

    const dialog = await screen.findByRole("dialog", {
      name: "Propose 3 changes",
    });
    await within(dialog).findByRole("heading", {
      name: "Proposed 1 of 3 changes",
    });
    const missing = within(dialog).getByRole("region", {
      name: "Pull request missing · 2",
    });
    const links = within(missing).getAllByRole("link", {
      name: "Create pull request on GitHub",
    });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "https://github.com/fimoklei/agent-harness/compare/main...maestro/code-review?expand=1",
      "https://github.com/fimoklei/agent-harness/compare/main...maestro/release-notes?expand=1",
    ]);
    expect(
      within(dialog).getByRole("region", { name: "Proposed · 1" }),
    ).toBeInTheDocument();
  });

  it("says pushed, not proposed, when no pull request opened", async () => {
    const pushedOnly = (ref: PrimitiveRef) => ({
      ...proposal(ref, 0),
      pullRequest: { state: "missing" as const },
    });
    stubHarnessServer({
      read: { body: PENDING },
      batch: {
        lines: streamOf({
          proposed: [
            pushedOnly(CODE_REVIEW),
            pushedOnly(RELEASE_NOTES),
            pushedOnly(TDD),
          ],
          failed: [],
        }),
      },
    });
    renderHarness();
    await tickThree();

    await userEvent.click(proposeChanges());

    const dialog = await screen.findByRole("dialog", {
      name: "Propose 3 changes",
    });
    expect(
      await within(dialog).findByRole("heading", {
        name: "Pushed 3 of 3 changes",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getAllByRole("link", {
        name: "Create pull request on GitHub",
      }),
    ).toHaveLength(3);
  });

  it("says the outcome is unknown when the stream ends before its report", async () => {
    stubHarnessServer({
      read: { body: PENDING },
      batch: {
        lines: [{ item: { ok: true, ...proposal(CODE_REVIEW, 101) } }],
      },
    });
    renderHarness();
    await tickThree();

    await userEvent.click(proposeChanges());

    const dialog = await screen.findByRole("dialog", {
      name: "Propose 3 changes",
    });
    expect(
      await within(dialog).findByText("No report from Maestro"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Some changes may already be proposed. Select Close, then select Re-read Harness to see each one.",
      ),
    ).toBeInTheDocument();
  });

  it("states a refusal of the whole batch in the dialog", async () => {
    stubHarnessServer({
      read: { body: PENDING },
      batch: { lines: [{ error: "promote-in-progress" }], status: 409 },
    });
    renderHarness();
    await tickThree();

    await userEvent.click(proposeChanges());

    const dialog = await screen.findByRole("dialog", {
      name: "Propose 3 changes",
    });
    expect(await within(dialog).findByText("Harness busy")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("heading", { name: /^Proposed/ }),
    ).toBeNull();
  });

  it("blocks Propose changes while the selection holds a deletion", async () => {
    const batches: Record<string, unknown>[] = [];
    stubHarnessServer({ read: { body: PENDING }, batches });
    renderHarness();
    await screen.findByRole("checkbox", { name: "Select code-review skill" });
    await userEvent.click(box("code-review"));
    await userEvent.click(box("old-deploy"));

    await expectTooltipCause(proposeChanges(), "Deselect the deleted items.");
    await userEvent.click(proposeChanges());

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(batches).toEqual([]);
  });
});
