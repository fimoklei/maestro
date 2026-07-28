import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RemoveSkillDialog } from "./remove-skill-dialog";
import type { RemoveWarningState } from "./remove-warning-view";

const REPO_TARGET = {
  kind: "repo" as const,
  repoPath: "/Users/me/project",
};

function renderDialog({
  target = REPO_TARGET as Parameters<typeof RemoveSkillDialog>[0]["target"],
  isRemoving = false,
  error = null as string | null,
  attempted = true,
  warning = "none" as RemoveWarningState,
  reclaim = [] as Parameters<typeof RemoveSkillDialog>[0]["reclaim"],
  onCancel = vi.fn(),
  onConfirm = vi.fn(),
} = {}) {
  render(
    <RemoveSkillDialog
      skillName="tdd"
      target={target}
      isRemoving={isRemoving}
      error={error}
      attempted={attempted}
      warning={warning}
      reclaim={reclaim}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );
  return { onCancel, onConfirm };
}

describe("RemoveSkillDialog", () => {
  it("names both the skill and the repo it would be taken off", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("tdd");
    expect(dialog).toHaveTextContent("/Users/me/project");
  });

  it("makes the confirm control the amber primary", () => {
    // Green reads as rest/deploy-confirmed and would misread on a destructive
    // action; red may never be a fill (DESIGN.md). Within this modal the amber
    // confirm is the single filled action.
    renderDialog();

    expect(screen.getByRole("button", { name: /^remove/i })).toHaveClass(
      "bg-amber",
    );
  });

  it("cancels without confirming", async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables both controls while the removal is in flight", () => {
    renderDialog({ isRemoving: true });

    expect(screen.getByRole("button", { name: /removing/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "cancel" })).toBeDisabled();
  });

  it("cannot be dismissed with Escape while the removal is in flight", async () => {
    const { onCancel } = renderDialog({ isRemoving: true });

    await userEvent.keyboard("{Escape}");

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("stays open on failure, stating apm's reason and the mixed-state risk", () => {
    renderDialog({ error: "apm did not confirm the removal." });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("apm did not confirm the removal.");
    expect(alert).toHaveTextContent(/mixed state/i);
  });

  it("does not claim a mixed state when nothing was attempted", () => {
    // A refusal happens before apm runs — the repo is exactly as it was. Saying
    // it might be half-changed would send the user hunting for damage that is
    // not there.
    renderDialog({
      error:
        "The deployed copy has local changes that never went through central.",
      attempted: false,
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("local changes");
    expect(alert).not.toHaveTextContent(/mixed state/i);
  });

  // The confirmation is the last moment the user can keep work apm would
  // delete without a word. Both cases warn; neither stands in the way (#337).

  it("states that local edits will be lost when the copy diverged", () => {
    renderDialog({ warning: "local-edits" });

    expect(screen.getByRole("status")).toHaveTextContent(/local edits/i);
  });

  it("says the copy cannot be checked, rather than calling it edited", () => {
    renderDialog({ warning: "cannot-verify" });

    const note = screen.getByRole("status");
    expect(note).toHaveTextContent(/can't be checked/i);
    // Claiming edits we never saw would be a fact we cannot state.
    expect(note).not.toHaveTextContent(/local edits will be lost/i);
  });

  it("wears amber with a glyph, never danger red", () => {
    // Red is reserved for validation errors; lost work is a consequence, not an
    // error (DESIGN.md). The glyph keeps colour from being the only signal.
    renderDialog({ warning: "local-edits" });

    const note = screen.getByRole("status");
    expect(note.className).toContain("amber");
    expect(note.className).not.toContain("danger");
    expect(note).toHaveTextContent("▲");
  });

  it("leaves the confirm control usable under either warning", () => {
    for (const warning of ["local-edits", "cannot-verify"] as const) {
      const { onConfirm } = renderDialog({ warning });

      const confirm = screen
        .getAllByRole("button", { name: /^remove/i })
        .at(-1);
      expect(confirm).toBeEnabled();
      confirm?.click();
      expect(onConfirm).toHaveBeenCalledTimes(1);
    }
  });

  it("holds the confirm control until the check has answered", async () => {
    // An answered warning never blocks (#337) — but an unfinished check has not
    // warned about anything yet. Confirming through it destroys the copy before
    // the one screen that could have named the cost got to say it.
    const { onConfirm } = renderDialog({ warning: "checking" });

    const confirm = screen.getByRole("button", { name: /^remove/i });
    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("leaves cancel usable while the check is still running", () => {
    // Waiting on the check must never trap the user in the dialog.
    renderDialog({ warning: "checking" });

    expect(screen.getByRole("button", { name: "cancel" })).toBeEnabled();
  });

  it("says a failed check failed, rather than blaming a missing baseline", () => {
    renderDialog({ warning: "check-failed" });

    const note = screen.getByRole("status");
    expect(note).toHaveTextContent(/couldn't check this copy/i);
    // "Nothing was recorded" names a cause nothing observed.
    expect(note).not.toHaveTextContent(/nothing was recorded/i);
  });

  it("says the check is still running instead of staying silent", () => {
    // Silence reads as "nothing to lose", which is the one thing an unfinished
    // check cannot promise (J04).
    renderDialog({ warning: "checking" });

    expect(screen.getByRole("status")).toHaveTextContent(/checking/i);
  });

  it("shows no warning at all once the copy came back clean", () => {
    renderDialog({ warning: "none" });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  // The cockpit's voice: terse, technical, second person nowhere (DESIGN.md
  // § Fixed Vocabulary, PRODUCT.md § Voice). This dialog is prose-heavy, so it
  // is where the rule slips first.
  describe("its voice", () => {
    it("addresses nobody as 'you' or 'we', in any state", () => {
      for (const warning of [
        "none",
        "checking",
        "local-edits",
        "cannot-verify",
        "check-failed",
      ] as const) {
        renderDialog({
          target: { kind: "global", tools: ["claude", "codex"] },
          warning,
          reclaim: [{ tool: "claude", path: "/Users/me/.claude/skills/tdd" }],
        });

        const dialog = screen.getAllByRole("dialog").at(-1);
        expect(dialog?.textContent).not.toMatch(/\b(you|your|we|our)\b/i);
      }
    });

    it("says what to do about local edits instead of naming an internal route", () => {
      // "never went through central" describes a pipeline, not a step the
      // reader can take before agreeing to lose the edits.
      renderDialog({ warning: "local-edits" });

      const note = screen.getByRole("status");
      expect(note).not.toHaveTextContent(/central/i);
      expect(note).toHaveTextContent(/copy them out/i);
    });

    it("promises no redeploy, because a redeploy pins to the latest tag", () => {
      // The removed version is not what comes back, so the dialog offers no
      // comfort it cannot keep (#386).
      renderDialog();

      expect(screen.getByRole("dialog")).not.toHaveTextContent(
        /deploy it again/i,
      );
    });
  });

  it("takes focus into the panel when it opens", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  // The global scope. The user clicked inside one tool's card, so the modal has
  // to say out loud that the other detected tools go too — that line is what
  // keeps the screen honest about a set-based action (#338).
  describe("on the global target", () => {
    const globalTarget = {
      kind: "global" as const,
      tools: ["claude", "codex"],
    };

    it("names every detected tool the removal will touch", () => {
      renderDialog({ target: globalTarget });

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("Claude Code");
      expect(dialog).toHaveTextContent("Codex");
    });

    it("names the scope as the whole tool set, not a path", () => {
      renderDialog({ target: globalTarget });

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent(/every detected tool/i);
      expect(dialog).not.toHaveTextContent("/Users/me/project");
    });

    it("says there is no per-tool removal", () => {
      // apm's uninstall has no -t, and the lever that looks like one orphans
      // the other tools' files — so the promise the modal makes is set-based.
      renderDialog({ target: globalTarget });

      expect(screen.getByRole("dialog")).toHaveTextContent(/no per-tool/i);
    });

    it("names the single detected tool when the machine has only one", () => {
      renderDialog({ target: { kind: "global", tools: ["claude"] } });

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("Claude Code");
      expect(dialog).not.toHaveTextContent("Codex");
    });

    it("still carries the divergence warning", () => {
      renderDialog({ target: globalTarget, warning: "local-edits" });

      expect(screen.getByRole("status")).toHaveTextContent(/local edits/i);
    });

    // A global removal force-deletes the whole copy of any exclusive tool this
    // machine no longer detects, beyond what apm's own scoped uninstall
    // touches (#390). The confirmation must name it before the user
    // agrees to it, never leave it implicit in "its deployed files go".
    describe("naming what an untargeted tool's copy reclaim would also delete", () => {
      it("names the leftover tool and the exact path it would delete", () => {
        renderDialog({
          target: globalTarget,
          reclaim: [{ tool: "claude", path: "/Users/me/.claude/skills/tdd" }],
        });

        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveTextContent("Claude Code");
        expect(dialog).toHaveTextContent("/Users/me/.claude/skills/tdd");
        expect(dialog).toHaveTextContent(/not installed on this machine/i);
      });

      it("names each leftover tool when there is more than one", () => {
        renderDialog({
          target: globalTarget,
          reclaim: [
            { tool: "claude", path: "/Users/me/.claude/skills/tdd" },
            { tool: "codex", path: "/Users/me/.agents/skills/tdd" },
          ],
        });

        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveTextContent("/Users/me/.claude/skills/tdd");
        expect(dialog).toHaveTextContent("/Users/me/.agents/skills/tdd");
      });

      it("says nothing extra when there is no leftover to reclaim", () => {
        renderDialog({ target: globalTarget, reclaim: [] });

        expect(screen.queryByText(/not installed on this machine/i)).toBeNull();
        expect(screen.queryByRole("status", { name: /also deleted/i })).toBe(
          null,
        );
      });

      // What #390 asks for: make the destructive path as
      // inspectable and as loud as the deploy path. A force-deleted directory
      // the user never targeted gets its own announced region, not a line of
      // dim text below the consequence line.
      it("announces the leftover as its own region rather than quiet prose", () => {
        renderDialog({
          target: globalTarget,
          reclaim: [{ tool: "claude", path: "/Users/me/.claude/skills/tdd" }],
        });

        const region = screen.getByRole("status", { name: /also deleted/i });
        expect(region).toHaveTextContent("/Users/me/.claude/skills/tdd");
      });
    });
  });
});
