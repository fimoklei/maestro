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

// The cockpit's type scale, largest first (styles/theme.css @theme). Assertions
// name a step's position rather than the token it lands on: what the tests are
// protecting is the ordering, not the sizes it currently resolves to.
const SCALE = [
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
  SCALE.findIndex((size) => element.className.includes(size));

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

  it("tags the primitive's type beside the question", () => {
    // The title says which build goes; the tag says what kind of thing it is,
    // in the same chip the inventory and the detail pane use.
    renderDialog();

    expect(screen.getByText("skill").className).toContain("text-type-skill");
  });

  // The panel asks one question and then answers only "what disappears, and
  // where". The answer is a ledger of targets, not a paragraph about them
  // (#411).
  describe("its ledger of targets", () => {
    it("holds the repo path in a single row on the repo scope", () => {
      renderDialog();

      expect(screen.getAllByRole("listitem").map((r) => r.textContent)).toEqual(
        [REPO_TARGET.repoPath],
      );
    });

    it("wraps a long path mid-token rather than pushing the panel wider", () => {
      // A repo path has no spaces to break at, so without this it sets the
      // panel's width instead of fitting inside it.
      renderDialog();

      expect(screen.getByText(REPO_TARGET.repoPath).className).toContain(
        "break-all",
      );
    });

    it("introduces the ledger with one lead-in line", () => {
      renderDialog();

      expect(
        screen.getByText("Primitive will be removed from:"),
      ).toBeInTheDocument();
    });

    // There is no per-tool remove — apm's uninstall has no -t, and faking one
    // orphans the other tools' files (ADR-0013). The old panel said so in a
    // sentence. The ledger says it by giving a row nothing to press: a row that
    // looks actionable makes a promise the system cannot keep.
    it("gives no row anything to press, focus, or read as a control", () => {
      renderDialog({ target: { kind: "global", tools: ["claude", "codex"] } });

      for (const row of screen.getAllByRole("listitem")) {
        expect(
          row.querySelector("button, a, input, [role='button']"),
        ).toBeNull();
        expect(row.querySelector("[tabindex]")).toBeNull();
        expect(row).not.toHaveAttribute("tabindex");
        expect(row).not.toHaveAttribute("onclick");
      }
    });

    it("puts no glyph on a row, because no row has a state to signal yet", () => {
      renderDialog({ target: { kind: "global", tools: ["claude", "codex"] } });

      for (const row of screen.getAllByRole("listitem")) {
        expect(row.textContent).not.toMatch(/[▲✕✓·•→]/);
      }
    });
  });

  // Three lines left the panel with the ledger: the note that there is no
  // per-tool remove, the deployed-files-and-lockfile line, and the skill name
  // on the confirm control.
  describe("what it no longer says", () => {
    it("drops the deployed-files-and-lockfile line", () => {
      renderDialog();

      expect(screen.getByRole("dialog")).not.toHaveTextContent(
        /lockfile entry/i,
      );
    });

    it("drops the note that there is no per-tool remove", () => {
      renderDialog({ target: { kind: "global", tools: ["claude", "codex"] } });

      expect(screen.getByRole("dialog")).not.toHaveTextContent(/per-tool/i);
    });
  });

  // The confirm label used to grow with the skill name inside a fixed-width
  // panel, so it had to shrink and ellipsise to fit (#388). The title already
  // carries the name, so the label can stop repeating it — and then it cannot
  // overflow at all.
  describe("its footer controls", () => {
    it("confirms with a fixed label that carries no name", () => {
      renderDialog();

      const confirm = screen.getByRole("button", { name: /^remove/i });
      expect(confirm).toHaveTextContent("remove →");
      expect(confirm).not.toHaveTextContent("tdd");
    });

    it("carries no name while the removal is in flight either", () => {
      renderDialog({ isRemoving: true });

      expect(
        screen.getByRole("button", { name: /removing/i }),
      ).not.toHaveTextContent("tdd");
    });

    it("cancels with the same fixed label", () => {
      renderDialog();

      expect(screen.getByRole("button", { name: "cancel" })).toHaveTextContent(
        "cancel",
      );
    });
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

  // Amber and ▲ mean "this removal will cost something" (DESIGN.md § The Two
  // Signals Rule). A check that has not answered has claimed nothing, and
  // dressing it as a warning put the loudest block in the panel on screen and
  // then took it away again on every removal of a clean copy.
  it("wears no warning surface while the check is still running", () => {
    renderDialog({ preflight: warns("checking") });

    const note = screen.getByRole("status");
    expect(note.className).not.toContain("amber");
    expect(note).not.toHaveTextContent("▲");
  });

  // "checking" almost always resolves into the clean panel, so the running
  // check speaks from beside the control it is holding. In the body it would
  // move the confirm button when the answer landed — under the pointer of
  // someone waiting to press it.
  it("states beside the confirm control why it is unavailable", () => {
    renderDialog({ preflight: warns("checking") });

    const confirm = screen.getByRole("button", { name: /^remove/i });
    expect(confirm).toBeDisabled();
    expect(confirm.getAttribute("aria-describedby")).toBe(
      screen.getByRole("status").id,
    );
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

    it("sets every ledger row in mono, because a target is data", () => {
      renderDialog({ target: { kind: "global", tools: ["claude", "codex"] } });

      for (const row of screen.getAllByRole("listitem")) {
        expect(row.className).toContain("font-mono");
      }
    });

    it("sets the lead-in as prose, because it is the sentence over the data", () => {
      renderDialog();

      expect(
        screen.getByText("Primitive will be removed from:").className,
      ).toContain("font-ui");
    });

    it("sets the warning as prose rather than data", () => {
      renderDialog({ preflight: warns("local-edits") });

      expect(screen.getByRole("status").className).toContain("font-ui");
    });

    // The panel's answer is the ledger, and the lead-in only introduces it. The
    // answer therefore sits above its own label on the scale — the same
    // ordering the old panel got wrong when its consequence line matched the
    // boilerplate beneath it. Asserted as a step rather than two literal
    // tokens: the rule is the ordering, not the sizes it lands on.
    it("steps the ledger above the lead-in that introduces it", () => {
      renderDialog();

      const leadIn = screen.getByText("Primitive will be removed from:");
      // The repo scope has exactly one row, so the singular query also asserts
      // the ledger is not quietly listing something else.
      const row = screen.getByRole("listitem");
      expect(stepOf(row)).toBeGreaterThanOrEqual(0);
      expect(stepOf(row)).toBeLessThan(stepOf(leadIn));
      // The second half of the step: the introducing line also drops down the
      // text ramp, so size is not carrying the difference alone.
      expect(leadIn.className).toContain("text-muted");
      expect(row.className).not.toContain("text-muted");
    });

    // The failure block used to name its problem in the panel's smallest text
    // and then explain it in the panel's largest, so the box shouted the detail
    // and whispered the headline.
    it("never names a failure more quietly than it explains it", () => {
      renderDialog({ error: "apm did not confirm the removal." });

      const label = screen.getByText("the removal failed");
      const message = screen.getByText("apm did not confirm the removal.");
      expect(stepOf(label)).toBeGreaterThanOrEqual(0);
      expect(stepOf(label)).toBeLessThanOrEqual(stepOf(message));
      // Weight carries the label instead, so the two lines can share a size.
      expect(label.className).toContain("font-semibold");
    });
  });

  it("takes focus into the panel when it opens", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  // The label carries the question alone, so without a description a screen
  // reader hears "Remove tdd v0.5.0?, dialog" and has to go looking for the
  // facts the confirmation exists to state. The warning and failure blocks
  // announce themselves and stay out of it.
  describe("what it announces with the question", () => {
    const describedBy = () =>
      (screen.getByRole("dialog").getAttribute("aria-describedby") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");

    it("reads the lead-in and then every target it would remove from", () => {
      renderDialog();

      expect(describedBy()).toContain("Primitive will be removed from:");
      expect(describedBy()).toContain(REPO_TARGET.repoPath);
    });

    it("carries the whole tool set on the global path", () => {
      // The one fact #338 exists for. Left out of the description, it is the
      // one thing a reader has to go hunting for. The ledger carries it now
      // that the sentence naming the set is gone.
      renderDialog({ target: { kind: "global", tools: ["claude", "codex"] } });

      expect(describedBy()).toContain("Claude Code");
      expect(describedBy()).toContain("Codex");
    });

    // The description used to point at three prose lines. Two of them are gone,
    // and pointing at an id nothing renders leaves a reader hearing the label
    // and nothing else.
    it("points at nothing that is not on screen", () => {
      renderDialog();

      const ids = (
        screen.getByRole("dialog").getAttribute("aria-describedby") ?? ""
      ).split(" ");
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        expect(document.getElementById(id)).not.toBeNull();
      }
    });
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

    it("ties the reason to the control it took away", () => {
      // A disabled button with its reason loose on the page states that reason
      // to sighted readers alone.
      renderDialog({ preflight: refused });

      expect(
        screen
          .getByRole("button", { name: /^remove/i })
          .getAttribute("aria-describedby"),
      ).toBe(screen.getByRole("alert").id);
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

    it("names the tools themselves rather than a summary of them", () => {
      // "every detected tool" made the reader trust a count they could not
      // see. The ledger spends the same space naming them.
      renderDialog({ target: globalTarget });

      const dialog = screen.getByRole("dialog");
      expect(dialog).not.toHaveTextContent(/every detected tool/i);
      expect(dialog).not.toHaveTextContent("/Users/me/project");
    });

    it("lists one row per detected tool, in the order it was handed them", () => {
      renderDialog({ target: { kind: "global", tools: ["codex", "claude"] } });

      expect(
        screen.getAllByRole("listitem").map((row) => row.textContent),
      ).toEqual(["Codex", "Claude Code"]);
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
