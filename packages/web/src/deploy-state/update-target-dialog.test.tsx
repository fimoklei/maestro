import type { UpdatePreview } from "@maestro/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UpdateTargetDialog } from "./update-target-dialog";

const row = (name: string) => ({
  name,
  url: `https://github.com/fimoklei/agent-harness/tree/v0.3.4/.apm/skills/${name}`,
});

const PREVIEW: UpdatePreview = {
  release: "v0.3.2",
  chosenRelease: "v0.3.4",
  counts: { changed: 2, removed: 1, unchanged: 3 },
  addedByThisDeploy: [],
  changed: [row("tdd"), row("jobs")],
  removed: ["review"],
  unchanged: ["grill", "brief", "worktree"],
  newInRelease: [row("wizard")],
  localEdits: { discard: [], unverified: [] },
  selection: {
    current: ["tdd", "jobs", "review", "grill", "brief", "worktree"],
    desired: ["tdd", "jobs", "grill", "brief", "worktree"],
  },
  copyReceipt: null,
  token: "a".repeat(64),
};

const preview = (patch: Partial<UpdatePreview> = {}): UpdatePreview => ({
  ...PREVIEW,
  ...patch,
});

function show(patch: Partial<UpdatePreview> = {}, onConfirm = vi.fn()) {
  render(
    <UpdateTargetDialog
      targetName="agent-harness"
      preview={preview(patch)}
      isLoading={false}
      error={null}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
}

const confirmButton = () =>
  screen.getByRole("button", { name: "Update target" });

describe("UpdateTargetDialog", () => {
  it("names the target in its title and the act in its confirm", () => {
    show();

    expect(
      screen.getByRole("dialog", { name: "Update agent-harness" }),
    ).toBeTruthy();
    expect(confirmButton()).toBeTruthy();
  });

  it("opens with the size of the change", () => {
    show();

    expect(
      screen.getByText("Updates 2 skills, removes 1, leaves 3 unchanged."),
    ).toBeTruthy();
  });

  it("names the release the target moves to", () => {
    show();

    expect(screen.getByText("release v0.3.2 → v0.3.4")).toBeTruthy();
  });

  it("renders the sections it has, in the fixed order", () => {
    show({ addedByThisDeploy: [row("brief")] });

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toStrictEqual([
      "Added by this deploy",
      "Changed",
      "Removed by this release",
      "Unchanged (3)",
      "New in this release (1)",
    ]);
  });

  it("folds Unchanged and New in this release behind their counts", () => {
    show();

    const folded = screen
      .getAllByRole("group")
      .map((group) => (group as HTMLDetailsElement).open);
    expect(folded).toStrictEqual([false, false]);
  });

  it("links a changed and a new skill to its folder at the chosen release", () => {
    show();

    expect(screen.getByRole("link", { name: "tdd" }).getAttribute("href")).toBe(
      "https://github.com/fimoklei/agent-harness/tree/v0.3.4/.apm/skills/tdd",
    );
    expect(
      screen.getByRole("link", { name: "wizard" }).getAttribute("href"),
    ).toBe(
      "https://github.com/fimoklei/agent-harness/tree/v0.3.4/.apm/skills/wizard",
    );
  });

  it("names a skill with no readable origin without a link", () => {
    show({ changed: [{ name: "tdd", url: null }] });

    expect(screen.queryByRole("link", { name: "tdd" })).toBeNull();
    expect(screen.getByText("tdd")).toBeTruthy();
  });

  it("offers no checkbox under New in this release", () => {
    show();

    const section = screen
      .getByRole("heading", { level: 3, name: "New in this release (1)" })
      .closest("details") as HTMLElement;
    expect(within(section).queryByRole("checkbox")).toBeNull();
    expect(within(section).getByText("not added")).toBeTruthy();
  });

  it("states the exact Selection the update leaves behind", () => {
    show();

    expect(
      screen.getByText(
        "Selected skills after this update: tdd, jobs, grill, brief and worktree.",
      ),
    ).toBeTruthy();
  });

  it("states the target becoming Empty when the release removes every skill", () => {
    show({
      counts: { changed: 0, removed: 1, unchanged: 0 },
      changed: [],
      unchanged: [],
      removed: ["review"],
      selection: { current: ["review"], desired: [] },
    });

    expect(
      screen.getByText(
        "This release removes every selected skill. The target will become Empty.",
      ),
    ).toBeTruthy();
  });

  it("badges a release that touches nothing selected and still offers the confirm", () => {
    show({
      counts: { changed: 0, removed: 0, unchanged: 3 },
      changed: [],
      removed: [],
    });

    // A resting reading: the word alone is the badge's text.
    const badge = screen.getByText("No content changes");
    expect(badge).toHaveTextContent(/^No content changes$/);
    expect(confirmButton().hasAttribute("disabled")).toBe(false);
  });

  it("badges nothing where the release changes something", () => {
    show();

    expect(screen.queryByText("No content changes")).toBeNull();
  });

  it("holds the confirm until every local-edits and unverified consent is given", async () => {
    const user = userEvent.setup();
    const onConfirm = show({
      localEdits: {
        discard: [{ name: "tdd", tool: null }],
        unverified: [{ name: "jobs", tool: null }],
      },
      copyReceipt: "b".repeat(64),
    });

    expect(confirmButton().hasAttribute("disabled")).toBe(true);
    await user.click(
      screen.getByRole("checkbox", { name: "Discard local edits for tdd" }),
    );
    expect(confirmButton().hasAttribute("disabled")).toBe(true);
    await user.click(
      screen.getByRole("checkbox", {
        name: "Overwrite unverified copy for jobs",
      }),
    );
    expect(confirmButton().hasAttribute("disabled")).toBe(false);

    await user.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("says what each copy at risk costs, naming its tool on a global target", () => {
    show({
      localEdits: {
        discard: [{ name: "tdd", tool: "claude" }],
        unverified: [{ name: "jobs", tool: "codex" }],
      },
      copyReceipt: "b".repeat(64),
    });

    expect(
      screen.getByText(
        "tdd has local edits. This update replaces them with release v0.3.4.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "jobs could not be verified. This update overwrites it.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("checkbox", {
        name: "Discard local edits for tdd in Claude Code",
      }),
    ).toBeTruthy();
  });

  // Story 36: two ways out, so the one this dialog cannot host names its place.
  it("names importing as the way to keep the work, beside discarding it", () => {
    show({
      localEdits: { discard: [{ name: "tdd", tool: null }], unverified: [] },
      copyReceipt: "b".repeat(64),
    });

    const keep = screen.getByText(
      "To keep the edits instead, select Cancel, then Import skill… on the Harness screen.",
    );
    // Cause first, then the step (copy.md): the consent precedes the way out.
    const consent = screen.getByRole("checkbox", {
      name: "Discard local edits for tdd",
    });
    expect(
      consent.compareDocumentPosition(keep) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("names what is loading while the preview is read", () => {
    render(
      <UpdateTargetDialog
        targetName="agent-harness"
        preview={null}
        isLoading={true}
        error={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText("Loading the update preview…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Update target" })).toBeNull();
  });

  it("blocks the confirm with its cause when the Harness names no origin", () => {
    render(
      <UpdateTargetDialog
        targetName="agent-harness"
        preview={null}
        isLoading={false}
        blocked="Update target — no GitHub origin"
        error={{
          level: "error",
          label: "No GitHub origin",
          message: "Point the Harness clone's origin at its GitHub repository.",
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Update target — no GitHub origin",
    });
    expect(button).toBeDisabled();
  });
});

// What the reader sees once apm ran: the ledger replaces the plan (#954).
describe("UpdateTargetDialog outcome", () => {
  const showOutcome = (
    outcome: {
      name: string;
      tool: "claude" | "codex" | null;
      state: "updated" | "removed" | "not-updated" | "not-removed" | "unknown";
    }[],
    props: { incomplete?: boolean; onRetry?: () => void } = {},
  ) =>
    render(
      <UpdateTargetDialog
        targetName="agent-harness"
        preview={preview()}
        isLoading={false}
        error={null}
        outcome={outcome}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        {...props}
      />,
    );

  it("states one line per skill and drops the sections it planned", () => {
    showOutcome([
      { name: "tdd", tool: null, state: "updated" },
      { name: "review", tool: null, state: "removed" },
    ]);

    expect(screen.getByText("tdd updated to v0.3.4")).toBeInTheDocument();
    expect(screen.getByText("review removed")).toBeInTheDocument();
    expect(screen.queryByText("Changed")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update target" })).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("names the tool of a failing row on the global target", () => {
    showOutcome([
      { name: "grill", tool: "claude", state: "updated" },
      { name: "grill", tool: "codex", state: "not-updated" },
    ]);

    expect(
      screen.getByText("grill still at v0.3.2 in Codex"),
    ).toBeInTheDocument();
  });

  it("offers Retry update on a partial landing", async () => {
    const onRetry = vi.fn();
    showOutcome([{ name: "grill", tool: null, state: "not-updated" }], {
      incomplete: true,
      onRetry,
    });

    expect(screen.getByText("Update incomplete")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry update" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("blocks the confirm while the update is running", () => {
    render(
      <UpdateTargetDialog
        targetName="agent-harness"
        preview={preview()}
        isLoading={false}
        error={null}
        isRunning
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Updating to v0.3.4…" }),
    ).toBeDisabled();
  });
});
