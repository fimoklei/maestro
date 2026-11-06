import type { UpdatePreview } from "@maestro/core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectTooltipCause, sentence } from "../test-utils";
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
      folders={null}
      preview={preview(patch)}
      blocked={false}
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

const CLAUDE_FOLDER = {
  path: "~/.claude/skills",
  tool: "claude",
  detected: true,
} as const;
const CODEX_FOLDER = {
  path: "~/.agents/skills",
  tool: "codex",
  detected: true,
} as const;

function showGlobal(
  patch: Partial<UpdatePreview> = {},
  folders: readonly {
    path: string;
    tool: "claude" | "codex";
    detected: boolean;
  }[] = [CLAUDE_FOLDER, CODEX_FOLDER],
) {
  render(
    <UpdateTargetDialog
      targetName="Global"
      folders={folders}
      preview={preview(patch)}
      blocked={false}
      isLoading={false}
      error={null}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
    />,
  );
}

describe("UpdateTargetDialog on Global", () => {
  it("titles the dialog Update Global", () => {
    showGlobal();

    expect(
      screen.getByRole("dialog", { name: "Update Global" }),
    ).toBeInTheDocument();
  });

  const writesTo = () => screen.getByRole("group", { name: "Writes to" });

  it("lists every folder Global writes under Writes to", () => {
    showGlobal();

    expect(
      within(writesTo())
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toStrictEqual(["~/.claude/skills", "~/.agents/skills"]);
  });

  it("mutes a folder Global does not write and names its undetected tool", () => {
    showGlobal({}, [CLAUDE_FOLDER, { ...CODEX_FOLDER, detected: false }]);

    const [claude, codex] = within(writesTo()).getAllByRole("listitem");
    expect(
      within(codex as HTMLElement).getByText("~/.agents/skills").parentElement,
    ).toHaveClass("text-gray-11");
    expect(
      within(codex as HTMLElement).getByText(
        "Codex not detected · not written",
      ),
    ).toBeInTheDocument();
    expect(
      within(claude as HTMLElement).getByText("~/.claude/skills").parentElement,
    ).not.toHaveClass("text-gray-11");
  });

  it("shows one release line, one summary and one skill list", () => {
    showGlobal();

    expect(
      screen.getAllByText(sentence("release v0.3.2 → v0.3.4")),
    ).toHaveLength(1);
    expect(
      screen.getAllByText("Updates 2 skills, removes 1, leaves 3 unchanged."),
    ).toHaveLength(1);
    expect(screen.getAllByText("tdd")).toHaveLength(1);
  });

  it("puts Local edits on top, then Writes to, then the changes", () => {
    showGlobal({
      localEdits: {
        discard: [{ name: "tdd", tool: "codex" }],
        unverified: [],
      },
      copyReceipt: "b".repeat(64),
    });

    const localEdits = screen.getByRole("heading", { name: "Local edits" });
    const changed = screen.getByRole("heading", { name: "Changed" });
    const follows = (a: Node, b: Node) =>
      (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows(localEdits, writesTo())).toBe(true);
    expect(follows(writesTo(), changed)).toBe(true);
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toStrictEqual([
      "Local edits",
      "Changed",
      "Removed by this release",
      "Unchanged (3)",
      "New in this release (1)",
    ]);
  });

  it("names the folder of each copy at risk by its path, never its tool", () => {
    showGlobal({
      localEdits: {
        discard: [{ name: "tdd", tool: "codex" }],
        unverified: [{ name: "jobs", tool: "claude" }],
      },
      copyReceipt: "b".repeat(64),
    });

    expect(
      screen.getByRole("checkbox", {
        name: "Discard local edits for tdd in ~/.agents/skills",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "Overwrite unverified copy for jobs in ~/.claude/skills",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Codex|Claude Code/)).toBeNull();
  });
});

describe("UpdateTargetDialog on a repository", () => {
  it("lists no Writes to", () => {
    show();

    expect(screen.queryByRole("group", { name: "Writes to" })).toBeNull();
    expect(screen.queryByText("Writes to")).toBeNull();
  });
});

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

  it("counts one skill in the singular, and keeps the sentence where nothing changes", () => {
    show({ counts: { changed: 1, removed: 0, unchanged: 0 } });
    expect(
      screen.getByText("Updates 1 skill, removes 0, leaves 0 unchanged."),
    ).toBeTruthy();
    cleanup();

    show({ counts: { changed: 0, removed: 0, unchanged: 5 } });
    expect(
      screen.getByText("Updates 0 skills, removes 0, leaves 5 unchanged."),
    ).toBeTruthy();
  });

  it("names the release the target moves to", () => {
    show();

    const move = screen.getByText(sentence("release v0.3.2 → v0.3.4"));
    // #1458: only the versions are mono; the words stay Geist.
    expect(move).not.toHaveClass("font-mono");
    expect(within(move).getByText("v0.3.4")).toHaveClass("font-mono");
  });

  it("renders the sections it has, in the fixed order", () => {
    show({
      addedByThisDeploy: [row("brief")],
      localEdits: { discard: [{ name: "tdd", tool: null }], unverified: [] },
      copyReceipt: "b".repeat(64),
    });

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toStrictEqual([
      "Local edits",
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

    expect(
      screen
        .getByRole("link", { name: "View tdd on GitHub" })
        .getAttribute("href"),
    ).toBe(
      "https://github.com/fimoklei/agent-harness/tree/v0.3.4/.apm/skills/tdd",
    );
    expect(
      screen
        .getByRole("link", { name: "View wizard on GitHub" })
        .getAttribute("href"),
    ).toBe(
      "https://github.com/fimoklei/agent-harness/tree/v0.3.4/.apm/skills/wizard",
    );
    // GitHub's mark carries the link; the name is plain text (#1181).
    expect(screen.queryByRole("link", { name: "tdd" })).toBeNull();
  });

  it("names a skill with no readable origin without a link", () => {
    show({ changed: [{ name: "tdd", url: null }] });

    expect(
      screen.queryByRole("link", { name: "View tdd on GitHub" }),
    ).toBeNull();
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

  it("leaves the selected skills to the sections, never a second list", () => {
    show();

    expect(screen.queryByText(/^Selected skills after/)).toBeNull();
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

    const badge = screen.getByText("No content changes");
    expect(badge).toHaveTextContent(/^No content changes$/);
    expect(confirmButton()).not.toHaveAttribute("aria-disabled");
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

    const held = () => screen.getByRole("button", { name: "Update target" });
    expectTooltipCause(held(), "To update this target, check every box above.");
    await user.click(held());
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("checkbox", { name: "Discard local edits for tdd" }),
    );
    expect(held()).toHaveAttribute("aria-disabled", "true");
    await user.click(
      screen.getByRole("checkbox", {
        name: "Overwrite unverified copy for jobs",
      }),
    );
    expect(confirmButton()).not.toHaveAttribute("aria-disabled");

    await user.click(confirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("ignores a click outside once a consent is checked", async () => {
    const onCancel = vi.fn();
    render(
      <UpdateTargetDialog
        targetName="agent-harness"
        folders={null}
        preview={preview({
          localEdits: {
            discard: [{ name: "tdd", tool: null }],
            unverified: [],
          },
          copyReceipt: "b".repeat(64),
        })}
        blocked={false}
        isLoading={false}
        error={null}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Discard local edits for tdd" }),
    );
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("sets the skills it lists in Geist, never mono", () => {
    show();

    for (const name of ["tdd", "review"]) {
      expect(screen.getByText(name, { exact: true })).toHaveClass("font-ui");
    }
  });

  it("says what each copy at risk costs", () => {
    show({
      localEdits: {
        discard: [{ name: "tdd", tool: null }],
        unverified: [{ name: "jobs", tool: null }],
      },
      copyReceipt: "b".repeat(64),
    });

    expect(
      screen.getByText(
        sentence(
          "tdd has local edits. This update replaces them with release v0.3.4.",
        ),
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        sentence("jobs could not be verified. This update overwrites it."),
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("checkbox", {
        name: "Discard local edits for tdd",
      }),
    ).toBeTruthy();
  });

  it("names importing as the way to keep the work, beside discarding it", () => {
    show({
      localEdits: { discard: [{ name: "tdd", tool: null }], unverified: [] },
      copyReceipt: "b".repeat(64),
    });

    const keep = screen.getByText(
      "To keep the edits instead, select Cancel, then select Import local edits.",
    );
    // Cause first, then the step: the consent precedes the way out.
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
        folders={null}
        preview={null}
        blocked={false}
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
        folders={null}
        preview={null}
        isLoading={false}
        blocked
        error={{
          label: "No GitHub origin",
          message: "Point the Harness clone's origin at its GitHub repository.",
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expectTooltipCause(
      screen.getByRole("button", { name: "Update target" }),
      /^No GitHub origin/,
    );
  });
});

describe("UpdateTargetDialog outcome", () => {
  const reportGroup = (label: string) =>
    screen
      .getByRole("heading", { level: 4, name: new RegExp(`^${label}`) })
      .closest("section") as HTMLElement;

  const showOutcome = (
    outcome: {
      name: string;
      tool: "claude" | "codex" | null;
      state: "updated" | "removed" | "not-updated" | "not-removed" | "unknown";
    }[],
    props: {
      incomplete?: boolean;
      onRetry?: () => void;
      isRunning?: boolean;
    } = {},
  ) =>
    render(
      <UpdateTargetDialog
        targetName="agent-harness"
        folders={null}
        preview={preview()}
        blocked={false}
        isLoading={false}
        error={null}
        outcome={{ kind: "skills", rows: outcome }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        {...props}
      />,
    );

  // #1776: an unchanged skill is never listed as updated.
  it("keeps the preview's groups, Unchanged folded, and drops the plan around them", () => {
    showOutcome([
      { name: "tdd", tool: null, state: "updated" },
      { name: "grill", tool: null, state: "updated" },
      { name: "review", tool: null, state: "removed" },
    ]);

    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Updated to v0.3.4",
      "Changed",
      "Removed by this release",
      "Unchanged (3)",
    ]);
    expect(screen.queryByText("Updated")).toBeNull();
    expect(screen.queryByText(/New in this release/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Update target" })).toBeNull();
  });

  it("lists a skill the update added under Deployed", () => {
    render(
      <UpdateTargetDialog
        targetName="agent-harness"
        folders={null}
        preview={preview({ addedByThisDeploy: [row("wizard")] })}
        blocked={false}
        isLoading={false}
        error={null}
        outcome={{ kind: "skills", rows: [] }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole("heading", { level: 3, name: "Deployed" })
        .closest("section"),
    ).toHaveTextContent("wizard");
  });

  it("names the tool of a failing row where the tools disagree", () => {
    showOutcome([
      { name: "grill", tool: "claude", state: "updated" },
      { name: "grill", tool: "codex", state: "not-updated" },
    ]);

    const failed = within(reportGroup("Failed"));
    expect(failed.getByText("grill in Codex")).toBeInTheDocument();
    expect(
      failed.getByText(
        sentence(
          "Still at v0.3.2. Check the target on the Deploy-state screen, then select Update target again.",
        ),
      ),
    ).toBeInTheDocument();
  });

  it("offers Retry update on a partial landing", async () => {
    const onRetry = vi.fn();
    showOutcome([{ name: "grill", tool: null, state: "not-updated" }], {
      incomplete: true,
      onRetry,
    });

    expect(screen.getByText("Update incomplete")).toBeInTheDocument();
    expect(
      within(reportGroup("Failed")).getByText(
        sentence(
          "Still at v0.3.2. Select Retry update to run the same release again.",
        ),
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry update" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("describes ✕ by Retry update's busy label while the retry runs", () => {
    showOutcome([{ name: "grill", tool: null, state: "not-updated" }], {
      incomplete: true,
      isRunning: true,
    });

    expectTooltipCause(
      // The header ✕ comes first; the leave control is the last Close.
      screen.getAllByRole("button", { name: "Close" })[0] as HTMLElement,
      "Updating…",
    );
  });

  it("names the confirm by its busy word while the update is running", () => {
    render(
      <UpdateTargetDialog
        targetName="agent-harness"
        folders={null}
        preview={preview()}
        blocked={false}
        isLoading={false}
        error={null}
        isRunning
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Updating…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});
