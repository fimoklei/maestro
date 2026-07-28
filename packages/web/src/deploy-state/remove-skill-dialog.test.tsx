import type { ReclaimPreview } from "@maestro/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  RemovePreflightView,
  RemoveWarningState,
} from "./remove-preflight-view";
import { RemoveSkillDialog } from "./remove-skill-dialog";

const REPO_TARGET = {
  kind: "repo" as const,
  repoPath: "/Users/me/project",
};

// The check answered (or is still answering): the removal is still on offer,
// and any leftover copies it named travel with that answer.
const warns = (
  warning: RemoveWarningState,
  reclaim: readonly ReclaimPreview[] = [],
): RemovePreflightView => ({ kind: "warning", warning, reclaim });

function renderDialog({
  target = REPO_TARGET as Parameters<typeof RemoveSkillDialog>[0]["target"],
  isRemoving = false,
  error = null as string | null,
  attempted = true,
  version = "v0.5.0" as string | null,
  preflight = warns("none") as RemovePreflightView,
  onCancel = vi.fn(),
  onConfirm = vi.fn(),
} = {}) {
  render(
    <RemoveSkillDialog
      skillName="tdd"
      version={version}
      target={target}
      isRemoving={isRemoving}
      error={error}
      attempted={attempted}
      preflight={preflight}
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

  // The row states `tdd v0.5.0`; the confirmation used to drop the version, so
  // the user had to carry it across a menu and a modal to know which build was
  // about to go.
  it("names the version being removed in the question it asks", () => {
    renderDialog({ version: "v0.5.0" });

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Remove tdd v0.5.0?",
    );
  });

  it("asks without a version when the row has none to name", () => {
    // A version the screen never had is not one to invent.
    renderDialog({ version: null });

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Remove tdd?",
    );
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

  // A warning and a failure used to render as the same object: same fill, same
  // border, same padding, told apart only by a glyph one of them lacked. "This
  // may cost work" and "the removal failed" mean opposite things.
  it("wears danger with a glyph when the removal failed, not the amber of a warning", () => {
    renderDialog({ error: "apm did not confirm the removal." });

    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("danger");
    expect(alert.className).not.toContain("amber");
    expect(alert).toHaveTextContent("✕");
  });

  it("says in words that the removal failed, so the colour is not the signal", () => {
    // The Never-Colour-Alone rule: every colour signal carries a glyph and a
    // word, so it survives without colour perception.
    renderDialog({ error: "apm did not confirm the removal." });

    expect(screen.getByRole("alert")).toHaveTextContent(/removal failed/i);
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
    renderDialog({ preflight: warns("local-edits") });

    expect(screen.getByRole("status")).toHaveTextContent(/local edits/i);
  });

  it("says the copy cannot be checked, rather than calling it edited", () => {
    renderDialog({ preflight: warns("cannot-verify") });

    const note = screen.getByRole("status");
    expect(note).toHaveTextContent(/can't be checked/i);
    // Claiming edits we never saw would be a fact we cannot state.
    expect(note).not.toHaveTextContent(/local edits will be lost/i);
  });

  it("wears amber with a glyph, never danger red", () => {
    // Red is reserved for validation errors; lost work is a consequence, not an
    // error (DESIGN.md). The glyph keeps colour from being the only signal.
    renderDialog({ preflight: warns("local-edits") });

    const note = screen.getByRole("status");
    expect(note.className).toContain("amber");
    expect(note.className).not.toContain("danger");
    expect(note).toHaveTextContent("▲");
  });

  it("leaves the confirm control usable under either warning", () => {
    for (const warning of ["local-edits", "cannot-verify"] as const) {
      const { onConfirm } = renderDialog({ preflight: warns(warning) });

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
    const { onConfirm } = renderDialog({ preflight: warns("checking") });

    const confirm = screen.getByRole("button", { name: /^remove/i });
    expect(confirm).toBeDisabled();
    await userEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("leaves cancel usable while the check is still running", () => {
    // Waiting on the check must never trap the user in the dialog.
    renderDialog({ preflight: warns("checking") });

    expect(screen.getByRole("button", { name: "cancel" })).toBeEnabled();
  });

  it("says a failed check failed, rather than blaming a missing baseline", () => {
    renderDialog({ preflight: warns("check-failed") });

    const note = screen.getByRole("status");
    expect(note).toHaveTextContent(/couldn't check this copy/i);
    // "Nothing was recorded" names a cause nothing observed.
    expect(note).not.toHaveTextContent(/nothing was recorded/i);
  });

  it("says the check is still running instead of staying silent", () => {
    // Silence reads as "nothing to lose", which is the one thing an unfinished
    // check cannot promise (J04).
    renderDialog({ preflight: warns("checking") });

    expect(screen.getByRole("status")).toHaveTextContent(/checking/i);
  });

  it("shows no warning at all once the copy came back clean", () => {
    renderDialog({ preflight: warns("none") });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  // The cockpit's voice: terse, technical, second person nowhere (DESIGN.md
  // § Fixed Vocabulary, PRODUCT.md § Voice). This dialog is prose-heavy, so it
  // is where the rule slips first.
  describe("its voice", () => {
    it("addresses nobody as 'you' or 'we', in any state", () => {
      const states: RemovePreflightView[] = [
        ...(
          [
            "none",
            "checking",
            "local-edits",
            "cannot-verify",
            "check-failed",
          ] as const
        ).map((warning) =>
          warns(warning, [
            { tool: "claude", path: "/Users/me/.claude/skills/tdd" },
          ]),
        ),
        { kind: "refused", message: "no global deployment to remove." },
      ];

      for (const preflight of states) {
        renderDialog({
          target: { kind: "global", tools: ["claude", "codex"] },
          preflight,
        });

        const dialog = screen.getAllByRole("dialog").at(-1);
        expect(dialog?.textContent).not.toMatch(/\b(you|your|we|our)\b/i);
      }
    });

    it("says what to do about local edits instead of naming an internal route", () => {
      // "never went through central" describes a pipeline, not a step the
      // reader can take before agreeing to lose the edits.
      renderDialog({ preflight: warns("local-edits") });

      const note = screen.getByRole("status");
      expect(note).not.toHaveTextContent(/central/i);
      expect(note).toHaveTextContent(/copy them out/i);
    });

    it("claims no more about the edits than the check can prove", () => {
      // The check compares the deployed files against the recorded hashes. It
      // never looks anywhere else, so whether these edits survive elsewhere is
      // outside what it saw — and a consent surface states only what it knows.
      renderDialog({ preflight: warns("local-edits") });

      expect(screen.getByRole("status")).not.toHaveTextContent(
        /nowhere else|for good|only copy/i,
      );
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

  // The Mono-Is-Data Rule: a name, a version, a path or an action is mono;
  // everything the user reads as a sentence is the sans body face. The dialog
  // is the most prose-heavy screen in the cockpit, so it is where the rule
  // slips first — it used to set every line, prose included, in mono.
  describe("its typography", () => {
    it("sets the path it would delete from in mono", () => {
      renderDialog();

      expect(screen.getByText(REPO_TARGET.repoPath).className).toContain(
        "font-mono",
      );
    });

    it("sets the consequence line as prose, with the tool names in mono", () => {
      renderDialog({ target: { kind: "global", tools: ["claude", "codex"] } });

      const consequence = screen.getByText(/no per-tool remove/i);
      expect(consequence.className).toContain("font-ui");
      expect(consequence.className).not.toContain("font-mono");
      expect(screen.getByText("Claude Code and Codex").className).toContain(
        "font-mono",
      );
    });

    it("sets the warning as prose rather than data", () => {
      renderDialog({ preflight: warns("local-edits") });

      expect(screen.getByRole("status").className).toContain("font-ui");
    });

    // The line that carries the real consequence used to sit at the same size
    // and colour as the boilerplate underneath it, so nothing told the reader
    // which of the two mattered. Asserted as a step on the scale rather than
    // two literal tokens: the rule is the ordering, not the sizes it lands on.
    it("steps the consequence line above the boilerplate beneath it", () => {
      // The cockpit's type scale, largest first (styles/theme.css @theme).
      const scale = [
        "text-title",
        "text-subtitle",
        "text-body",
        "text-data",
        "text-desc",
        "text-mono-sm",
        "text-chip",
        "text-tag",
      ];
      const stepOf = (element: HTMLElement) =>
        scale.findIndex((size) => element.className.includes(size));
      renderDialog({ target: { kind: "global", tools: ["claude", "codex"] } });

      const consequence = screen.getByText(/no per-tool remove/i);
      const boilerplate = screen.getByText(/lockfile entry/i);
      expect(stepOf(consequence)).toBeGreaterThanOrEqual(0);
      expect(stepOf(consequence)).toBeLessThan(stepOf(boilerplate));
      // The second half of the step: the quieter line also drops down the text
      // ramp, so size is not carrying the difference alone.
      expect(boilerplate.className).toContain("text-dim");
      expect(consequence.className).not.toContain("text-dim");
    });
  });

  it("takes focus into the panel when it opens", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  // The check can also come back with the server refusing the request outright.
  // That is not a failed check — it is the removal already known to be
  // impossible, so the dialog says why and stops offering it (#385).
  describe("when the check came back refused", () => {
    const refused = {
      kind: "refused" as const,
      message: "That repo is not registered with Maestro.",
    };

    it("states the server's own reason", () => {
      renderDialog({ preflight: refused });

      expect(screen.getByRole("alert")).toHaveTextContent(
        "That repo is not registered with Maestro.",
      );
    });

    it("never says work may be lost", () => {
      // There is nothing to lose: no removal will run. Borrowing the
      // failed-check wording would warn about a cost that cannot be paid.
      renderDialog({ preflight: refused });

      const dialog = screen.getByRole("dialog");
      expect(dialog).not.toHaveTextContent(/may lose work/i);
      expect(dialog).not.toHaveTextContent(/couldn't check this copy/i);
    });

    it("takes the confirm control away", async () => {
      const { onConfirm } = renderDialog({ preflight: refused });

      const confirm = screen.getByRole("button", { name: /^remove/i });
      expect(confirm).toBeDisabled();
      await userEvent.click(confirm);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("leaves cancel as the way out", () => {
      renderDialog({ preflight: refused });

      expect(screen.getByRole("button", { name: "cancel" })).toBeEnabled();
    });

    it("wears danger red with a glyph, not the amber of lost work", () => {
      // Amber says "this will cost you something"; this says "this cannot
      // happen". Red is the error signal (issue #213), and the glyph keeps
      // colour from being the only one.
      renderDialog({ preflight: refused });

      const alert = screen.getByRole("alert");
      expect(alert.className).toContain("danger");
      expect(alert).toHaveTextContent("✕");
    });

    it("drops the promise that the skill can be redeployed", () => {
      // That line describes a removal about to happen. Under a refusal it
      // describes nothing.
      renderDialog({ preflight: refused });

      expect(screen.getByRole("dialog")).not.toHaveTextContent(
        /deploy it again/i,
      );
    });
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
      renderDialog({ target: globalTarget, preflight: warns("local-edits") });

      expect(screen.getByRole("status")).toHaveTextContent(/local edits/i);
    });

    // A global removal force-deletes the whole copy of any exclusive tool this
    // machine no longer detects, beyond what apm's own scoped uninstall
    // touches (#390). The confirmation must name it before the user
    // agrees to it, never leave it implicit in "its deployed files go".
    describe("naming what an untargeted tool's copy reclaim would also delete", () => {
      const leftover = [
        { tool: "claude" as const, path: "/Users/me/.claude/skills/tdd" },
      ];

      it("names the leftover tool and the exact path it would delete", () => {
        renderDialog({
          target: globalTarget,
          preflight: warns("none", leftover),
        });

        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveTextContent("Claude Code");
        expect(dialog).toHaveTextContent("/Users/me/.claude/skills/tdd");
        expect(dialog).toHaveTextContent(/not installed on this machine/i);
      });

      it("names each leftover tool when there is more than one", () => {
        renderDialog({
          target: globalTarget,
          preflight: warns("none", [
            ...leftover,
            { tool: "codex", path: "/Users/me/.agents/skills/tdd" },
          ]),
        });

        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveTextContent("/Users/me/.claude/skills/tdd");
        expect(dialog).toHaveTextContent("/Users/me/.agents/skills/tdd");
      });

      it("says nothing extra when there is no leftover to reclaim", () => {
        renderDialog({ target: globalTarget, preflight: warns("none") });

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
          preflight: warns("none", leftover),
        });

        const region = screen.getByRole("status", { name: /also deleted/i });
        expect(region).toHaveTextContent("/Users/me/.claude/skills/tdd");
      });
    });
  });
});
