import type { ReclaimPreview, RemoveOutcome } from "@maestro/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../api/http";
import { type DeployStateNotice, removeNotice } from "./notice-copy";
import type {
  RemoveCheckState,
  RemovePreflightView,
  RemoveRowWarning,
} from "./remove-preflight-view";
import { RemoveSkillDialog } from "./remove-skill-dialog";

const REPO_TARGET = {
  kind: "repo" as const,
  repoPath: "/Users/me/project",
};

// The notice for a removal apm ran but proved nothing about — read off the copy
// module, so the dialog's tests and the screen cannot drift apart.
const noticeFor = (code: string): DeployStateNotice =>
  removeNotice(new HttpError(500, "unused", code));
const FAILURE = noticeFor("remove-failed");
const REFUSAL = noticeFor("repo-not-registered");

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
const offers = (
  check: RemoveCheckState,
  reclaim: readonly ReclaimPreview[] = [],
): RemovePreflightView => ({ kind: "offered", check, reclaim });

// The repo scope's one answer, for its one row.
const repoCheck = (
  warning: RemoveRowWarning,
  reclaim: readonly ReclaimPreview[] = [],
) => offers({ kind: "repo", warning }, reclaim);

// The global scope's answer, one entry per detected tool.
const toolChecks = (
  warnings: Record<string, RemoveRowWarning>,
  reclaim: readonly ReclaimPreview[] = [],
) => offers({ kind: "per-tool", warnings }, reclaim);

// Every detected tool came back clean, for a test about something other than
// the check.
const cleanTools = (...tools: string[]) =>
  toolChecks(Object.fromEntries(tools.map((tool) => [tool, "none"] as const)));

// The check is still running: it has claimed nothing about any row yet.
const CHECKING = offers({ kind: "unanswered", warning: "checking" });

// The request that would have carried the per-row answers failed, so the same
// thing is true of every row.
const CHECK_FAILED = offers({ kind: "unanswered", warning: "check-failed" });

function renderDialog({
  target = REPO_TARGET as Parameters<typeof RemoveSkillDialog>[0]["target"],
  isRemoving = false,
  error = null as DeployStateNotice | null,
  restated = null as DeployStateNotice | null,
  outcome = null as RemoveOutcome | null,
  version = "v0.5.0" as string | null,
  preflight = repoCheck("none") as RemovePreflightView,
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
      restated={restated}
      outcome={outcome}
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
      "Remove tdd v0.5.0",
    );
  });

  it("asks without a version when the row has none to name", () => {
    // A version the screen never had is not one to invent.
    renderDialog({ version: null });

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Remove tdd",
    );
  });

  it("names the primitive's type beside the question", () => {
    // The title says which build goes; the type says what kind of thing it
    // is, in the plain word the Inventory's Type column uses (#987).
    renderDialog();

    expect(screen.getByText("Skill")).toBeInTheDocument();
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
        screen.getByText("Skill will be removed from:"),
      ).toBeInTheDocument();
    });

    // No per-tool remove — apm's uninstall has no -t, faking one orphans the
    // other tools' files (ADR-0013). Rows have nothing to press instead.
    it("gives no row anything to press, focus, or read as a control", () => {
      renderDialog({
        target: { kind: "global", tools: ["claude", "codex"] },
        preflight: cleanTools("claude", "codex"),
      });

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
      renderDialog({
        target: { kind: "global", tools: ["claude", "codex"] },
        preflight: cleanTools("claude", "codex"),
      });

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
      renderDialog({
        target: { kind: "global", tools: ["claude", "codex"] },
        preflight: cleanTools("claude", "codex"),
      });

      expect(screen.getByRole("dialog")).not.toHaveTextContent(/per-tool/i);
    });
  });

  // Confirm label used to grow with the skill name and ellipsise (#388);
  // the title now carries the name, so the label stops repeating it.
  describe("its footer controls", () => {
    it("confirms with a fixed label that carries no name", () => {
      renderDialog();

      const confirm = screen.getByRole("button", { name: /^remove/i });
      expect(confirm).toHaveTextContent("Remove skill");
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

      expect(screen.getByRole("button", { name: "Cancel" })).toHaveTextContent(
        "Cancel",
      );
    });
  });

  it("makes the confirm control the one filled action in the dialog", () => {
    // The primary action is neutral and no status hue is ever a fill
    // (ADR-0033 §2). Within this modal the confirm is the single filled
    // action.
    renderDialog();

    expect(screen.getByRole("button", { name: /^remove/i })).toHaveClass(
      "bg-gray-12",
    );
  });

  it("cancels without confirming", async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("holds both controls unpressable while the removal is in flight", () => {
    renderDialog({ isRemoving: true });

    // The write's own control stays focusable and states why (ADR-0033 §8);
    // closing is what must not happen mid-run, so Cancel is disabled outright.
    expect(screen.getByRole("button", { name: /removing/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("cannot be dismissed with Escape while the removal is in flight", async () => {
    const { onCancel } = renderDialog({ isRemoving: true });

    await userEvent.keyboard("{Escape}");

    expect(onCancel).not.toHaveBeenCalled();
  });

  it("stays open on failure, stating apm's reason", () => {
    renderDialog({ error: FAILURE });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(FAILURE.message);
  });

  // What the user needs before pressing retry, in the block that just told them
  // the removal failed. It used to be a paragraph sending them to check the repo
  // by hand (#415).
  it("says a retry picks up only what the failure left behind", () => {
    renderDialog({ error: FAILURE });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(FAILURE.detail ?? "");
    expect(alert).not.toHaveTextContent(/mixed state/i);
  });

  // The removal has already been confirmed once, so a footer offering "cancel"
  // and a confirm would be describing a dialog where nothing has happened yet.
  it("offers close and retry once a removal has failed", () => {
    renderDialog({ error: FAILURE });

    expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Confirm removal" }),
    ).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove skill" })).toBeNull();
  });

  it("re-fires the same removal from retry", async () => {
    const { onConfirm } = renderDialog({
      error: FAILURE,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Confirm removal" }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("states the retry is in flight and blocks closing while it runs", () => {
    renderDialog({
      error: FAILURE,
      isRemoving: true,
    });

    expect(screen.getByRole("button", { name: /removing/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });

  // The removal stopped because the copy is no longer the one this panel
  // priced, and it deleted nothing on the way (#364). Everything below keeps
  // that apart from a failure: nothing ran, so nothing is being retried.
  describe("when the copy changed since the check", () => {
    const RESTATED = noticeFor("cost-not-acknowledged");

    it("states the server's reason in the panel", () => {
      renderDialog({
        restated: RESTATED,
        preflight: repoCheck("cannot-verify"),
      });

      expect(screen.getByRole("alert")).toHaveTextContent(RESTATED.message);
    });

    it("wears the amber of a cost, never the danger of a failure", () => {
      renderDialog({
        restated: RESTATED,
        preflight: repoCheck("cannot-verify"),
      });

      const alert = screen.getByRole("alert");
      expect(alert.className).toContain("amber");
      expect(alert.className).not.toContain("danger");
      // Never-Colour-Alone: the glyph and the words carry it without colour.
      expect(alert).toHaveTextContent("⚠");
      expect(alert).toHaveTextContent(/Nothing removed/);
    });

    // The whole point of restating: the ledger states what the removal would
    // cost now, where a failure's dialog drops the cost it named before.
    it("keeps the ledger, stating the cost it found this time", () => {
      renderDialog({
        restated: RESTATED,
        preflight: repoCheck("cannot-verify"),
      });

      expect(
        screen.getByText("Nothing recorded — may lose work"),
      ).toBeInTheDocument();
    });

    it("still offers the first removal, because nothing has happened yet", () => {
      renderDialog({
        restated: RESTATED,
        preflight: repoCheck("cannot-verify"),
      });

      expect(
        screen.getByRole("button", { name: "Remove skill" }),
      ).toBeEnabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: "Confirm removal" }),
      ).toBeNull();
    });

    it("confirms the restated cost from that same control", async () => {
      const { onConfirm } = renderDialog({
        restated: RESTATED,
        preflight: repoCheck("cannot-verify"),
      });

      await userEvent.click(
        screen.getByRole("button", { name: "Remove skill" }),
      );

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  // A warning and a failure used to render as the same object: same fill, same
  // border, same padding, told apart only by a glyph one of them lacked. "This
  // may cost work" and "Removal outcome unknown" mean opposite things.
  it("wears danger with a glyph when the removal failed, not the amber of a warning", () => {
    renderDialog({ error: FAILURE });

    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("danger");
    expect(alert.className).not.toContain("amber");
    expect(alert).toHaveTextContent("✕");
  });

  it("says in words that the removal failed, so the colour is not the signal", () => {
    // The Never-Colour-Alone rule: every colour signal carries a glyph and a
    // word, so it survives without colour perception.
    renderDialog({ error: FAILURE });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Removal outcome unknown/,
    );
  });

  // The design handoff labels this block in apm's terms (`apm exited 1`, state
  // 3e). ADR-0018 refused that: apm's output never leaves the server, so the
  // label is Maestro's own and cannot move with whatever the server sent.
  it("keeps its own label whatever the server's sentence says", () => {
    renderDialog({
      error: FAILURE,
    });

    const alert = screen.getByRole("alert");
    expect(
      within(alert).getByText("Removal outcome unknown"),
    ).toBeInTheDocument();
    // The label is the panel's, not a mono echo of the reason beside it.
    expect(
      within(alert).getByText("Removal outcome unknown").className,
    ).not.toContain("font-mono");
  });

  // apm's uninstall reports one outcome for every tool at once, so after a
  // failure the server probes each target itself. The panel reports what it
  // proved, target by target, instead of warning about a mixed state (#416).
  describe("what the failed removal came off, target by target", () => {
    const FAILED = FAILURE;
    const globalTarget = {
      kind: "global" as const,
      tools: ["claude", "codex"],
    };
    const partial: RemoveOutcome = {
      scope: "global",
      tools: [
        { tool: "claude", state: "removed" },
        { tool: "codex", state: "not-removed" },
      ],
    };
    const rowFor = (name: string) =>
      screen
        .getAllByRole("listitem")
        .find((row) => row.textContent?.includes(name)) as HTMLElement;

    const renderPartialFailure = () =>
      renderDialog({
        target: globalTarget,
        preflight: cleanTools("claude", "codex"),
        error: FAILED,
        outcome: partial,
      });

    it("counts the targets the removal came off in the lead-in", () => {
      renderPartialFailure();

      expect(
        screen.getByText("Removed from 1 of 2 targets:"),
      ).toBeInTheDocument();
      expect(screen.queryByText("Skill will be removed from:")).toBeNull();
    });

    it("dims a target the removal came off and says so in words", () => {
      renderPartialFailure();

      const claude = rowFor("Claude Code");
      expect(claude).toHaveTextContent("Removed");
      expect(claude.className).not.toContain("bg-danger-bg");
    });

    it("fills a target it did not come off with danger, keeping its weight", () => {
      renderPartialFailure();

      const codex = rowFor("Codex");
      expect(codex).toHaveTextContent("Not removed");
      expect(codex.className).toContain("bg-danger-bg");
    });

    it("carries each outcome in a glyph too, so colour is never the signal", () => {
      renderPartialFailure();

      expect(rowFor("Claude Code").textContent).toContain("✓");
      expect(rowFor("Codex").textContent).toContain("✕");
    });

    it("keeps the row order the ledger showed before the user confirmed", () => {
      renderDialog({
        target: { kind: "global", tools: ["codex", "claude"] },
        preflight: cleanTools("claude", "codex"),
        error: FAILED,
        outcome: partial,
      });

      expect(
        screen.getAllByRole("listitem").map((row) => row.textContent),
      ).toEqual(["Codex✕ Not removed", "Claude Code✓ Removed"]);
    });

    it("never reads a target the probe could not answer for as removed", () => {
      renderDialog({
        error: FAILED,
        outcome: { scope: "repo", state: "unknown" },
      });

      const row = rowFor(REPO_TARGET.repoPath);
      expect(row).not.toHaveTextContent(/✓/);
      expect(row).toHaveTextContent("Outcome unknown");
    });

    // A ledger under a failure that proved nothing would name targets nobody
    // checked, under a lead-in still promising a removal that already ran.
    it("renders the error block alone when the failure proved nothing", () => {
      renderDialog({ error: FAILED, outcome: null });

      expect(screen.getByRole("alert")).toHaveTextContent(FAILED.message);
      expect(screen.queryAllByRole("listitem")).toEqual([]);
      expect(screen.queryByText(/removal targets/i)).toBeNull();
    });

    // The reclaim runs only after apm confirms, so a failure never reached
    // these copies and the report never names them.
    it("drops a leftover row the report could not answer for", () => {
      renderDialog({
        target: globalTarget,
        preflight: toolChecks({ claude: "none", codex: "none" }, [
          { tool: "claude", path: "/Users/me/.claude/skills/tdd" },
        ]),
        error: FAILED,
        outcome: partial,
      });

      expect(
        screen.getAllByRole("listitem").map((row) => row.textContent),
      ).toEqual(["Claude Code✓ Removed", "Codex✕ Not removed"]);
    });

    // The pre-confirm status priced a removal that then did not happen; leaving
    // it beside the outcome would state a cost nobody paid.
    it("drops the cost it named before the attempt", () => {
      renderDialog({
        target: globalTarget,
        preflight: toolChecks({ claude: "none", codex: "cannot-verify" }),
        error: FAILED,
        outcome: partial,
      });

      expect(screen.getByRole("dialog")).not.toHaveTextContent(/local edits/i);
    });

    it("announces the outcome, so it is not seen only by those who can see it", () => {
      renderPartialFailure();

      expect(
        within(
          screen.getByRole("status", { name: "Removal targets" }),
        ).getByText(/Not removed/),
      ).toBeInTheDocument();
    });
  });

  // The confirmation is the last moment the user can keep work apm would
  // delete without a word. Every case warns; none stands in the way (#337). The
  // warning lands on the row that carries it, so the panel never states a cost
  // in a paragraph the reader has to match back to a target (#414).
  describe("what the check says, on the row it is about", () => {
    // One row per detected tool, so a cost has somewhere to land that is not
    // the whole set.
    const globalTarget = {
      kind: "global" as const,
      tools: ["claude", "codex"],
    };

    const rowFor = (name: string) =>
      screen
        .getAllByRole("listitem")
        .find((row) => row.textContent?.includes(name)) as HTMLElement;

    it("marks only the tool whose copy carries a cost", () => {
      renderDialog({
        target: globalTarget,
        preflight: toolChecks({ claude: "none", codex: "cannot-verify" }),
      });

      expect(rowFor("Codex")).toHaveTextContent(
        "Nothing recorded — may lose work",
      );
      expect(rowFor("Claude Code")).not.toHaveTextContent(/local edits/i);
    });

    it("fills only that row with amber, and pairs it with the glyph", () => {
      // Red is reserved for validation errors; lost work is a consequence, not
      // an error (DESIGN.md). The glyph keeps colour from being the only signal
      // (Never-Colour-Alone).
      renderDialog({
        target: globalTarget,
        preflight: toolChecks({ claude: "none", codex: "cannot-verify" }),
      });

      expect(rowFor("Codex").className).toContain("amber");
      expect(rowFor("Codex")).toHaveTextContent("▲");
      expect(rowFor("Claude Code").className).not.toContain("amber");
      expect(rowFor("Claude Code")).not.toHaveTextContent("▲");
    });

    it("says the copy cannot be checked, rather than calling it edited", () => {
      renderDialog({
        target: globalTarget,
        preflight: toolChecks({ claude: "cannot-verify", codex: "none" }),
      });

      const row = rowFor("Claude Code");
      expect(row).toHaveTextContent("Nothing recorded — may lose work");
      // Claiming edits nothing saw would be a fact the check cannot state.
      expect(row).not.toHaveTextContent(/local edits/i);
    });

    it("keeps a check that never ran apart from a missing baseline", () => {
      renderDialog({
        target: globalTarget,
        preflight: toolChecks({ claude: "check-failed", codex: "none" }),
      });

      const row = rowFor("Claude Code");
      expect(row).toHaveTextContent("Check did not run — may lose work");
      expect(row).not.toHaveTextContent(/nothing recorded/i);
    });

    it("reads a tool the answer left out as unchecked, never as clean", () => {
      // The card detected two tools and the check reported on one. Silence on a
      // row would read as nothing-to-lose, which is what J04 forbids.
      renderDialog({
        target: globalTarget,
        preflight: toolChecks({ claude: "none" }),
      });

      expect(rowFor("Codex")).toHaveTextContent("Check did not run");
      expect(rowFor("Claude Code")).not.toHaveTextContent("Check did not run");
    });

    it("states a failed request on every row, because it answered for none", () => {
      renderDialog({ target: globalTarget, preflight: CHECK_FAILED });

      for (const row of screen.getAllByRole("listitem")) {
        expect(row).toHaveTextContent("Check did not run — may lose work");
      }
    });

    // A repo's deployed copy spans several tool subtrees and the panel gives it
    // one row, so one aggregate answer is the honest thing to state there.
    it("puts the repo scope's aggregate answer on its single row", () => {
      renderDialog({ preflight: repoCheck("cannot-verify") });

      const rows = screen.getAllByRole("listitem");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent("Nothing recorded — may lose work");
    });

    it("leaves no separate block saying which copy was edited", () => {
      renderDialog({ preflight: repoCheck("cannot-verify") });

      // The sentence the ledger replaced. Its absence is the point of #414.
      expect(screen.getByRole("dialog")).not.toHaveTextContent(
        /removing it deletes them|copy them out/i,
      );
    });

    it("warms the panel outline while a row states a cost", () => {
      renderDialog({ preflight: repoCheck("cannot-verify") });

      expect(screen.getByRole("dialog").className).toContain(
        "border-line-drift",
      );
    });

    it("keeps the neutral outline once every row came back clean", () => {
      renderDialog({ preflight: repoCheck("none") });

      expect(screen.getByRole("dialog").className).not.toContain("drift");
    });

    it("leaves the confirm control usable under any answered warning", () => {
      for (const warning of [
        "cannot-verify",
        "cannot-verify",
        "check-failed",
      ] as const) {
        const { onConfirm } = renderDialog({ preflight: repoCheck(warning) });

        const confirm = screen
          .getAllByRole("button", { name: /^remove/i })
          .at(-1);
        expect(confirm).toBeEnabled();
        confirm?.click();
        expect(onConfirm).toHaveBeenCalledTimes(1);
      }
    });
  });

  // Amber and ▲ mean "this removal will cost something" (DESIGN.md § The Two
  // Signals Rule) — an unanswered check has claimed nothing yet.
  describe("while the check is still running", () => {
    it("leaves every row plain, with no fill and no glyph", () => {
      renderDialog({
        target: { kind: "global", tools: ["claude", "codex"] },
        preflight: CHECKING,
      });

      for (const row of screen.getAllByRole("listitem")) {
        expect(row.className).not.toContain("amber");
        expect(row).not.toHaveTextContent("▲");
        expect(row).not.toHaveTextContent(/may lose work|deleted too/i);
      }
      expect(screen.getByRole("dialog").className).not.toContain("drift");
    });

    it("holds the confirm control until the check has answered", async () => {
      // An answered warning never blocks (#337) — but an unfinished check has
      // not warned about anything yet. Confirming through it destroys the copy
      // before the one screen that could have named the cost got to say it.
      const { onConfirm } = renderDialog({ preflight: CHECKING });

      const confirm = screen.getByRole("button", { name: /^remove/i });
      expect(confirm).toBeDisabled();
      await userEvent.click(confirm);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("leaves cancel usable, so waiting never traps the user", () => {
      renderDialog({ preflight: CHECKING });

      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    });

    it("says it is still running instead of staying silent", () => {
      // Silence reads as "nothing to lose", which is the one thing an
      // unfinished check cannot promise (J04).
      renderDialog({ preflight: CHECKING });

      expect(
        screen.getByRole("status", { name: /local edits check/i }),
      ).toHaveTextContent(/checking/i);
    });

    // The running check speaks from beside the control it is holding. In the
    // body it would move the confirm button when the answer landed — under the
    // pointer of someone waiting to press it.
    it("states beside the confirm control why it is unavailable", () => {
      renderDialog({ preflight: CHECKING });

      const confirm = screen.getByRole("button", { name: /^remove/i });
      expect(confirm).toBeDisabled();
      expect(confirm.getAttribute("aria-describedby")).toBe(
        screen.getByRole("status", { name: /local edits check/i }).id,
      );
    });

    it("says nothing about the check once it has answered", () => {
      renderDialog({ preflight: repoCheck("none") });

      expect(
        screen.queryByRole("status", { name: /local edits check/i }),
      ).toBeNull();
    });
  });

  it("shows no cost at all once the copy came back clean", () => {
    renderDialog({ preflight: repoCheck("none") });

    expect(screen.getByRole("dialog")).not.toHaveTextContent(
      /may lose work|deleted too|deleted in full/i,
    );
  });

  // The cockpit's voice: terse, technical, second person nowhere (DESIGN.md
  // § Fixed Vocabulary, PRODUCT.md § Voice). This dialog is prose-heavy, so it
  // is where the rule slips first.
  describe("its voice", () => {
    it("addresses nobody as 'you' or 'we', in any state", () => {
      const leftover = [
        { tool: "claude" as const, path: "/Users/me/.claude/skills/tdd" },
      ];
      const states: RemovePreflightView[] = [
        CHECKING,
        CHECK_FAILED,
        ...(["none", "cannot-verify", "check-failed"] as const).map((warning) =>
          toolChecks({ claude: warning, codex: warning }, leftover),
        ),
        {
          kind: "refused" as const,
          code: "repo-not-registered" as const,
          notice: REFUSAL,
        },
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

    it("names the state of the copy, never an internal route", () => {
      // "never went through central" describes a pipeline, not something the
      // reader can act on before agreeing to lose the edits.
      renderDialog({ preflight: repoCheck("cannot-verify") });

      expect(screen.getByRole("dialog")).not.toHaveTextContent(/central/i);
    });

    it("claims no more about the edits than the check can prove", () => {
      // The check compares the deployed files against the recorded hashes. It
      // never looks anywhere else, so whether these edits survive elsewhere is
      // outside what it saw — and a consent surface states only what it knows.
      renderDialog({ preflight: repoCheck("cannot-verify") });

      expect(screen.getByRole("dialog")).not.toHaveTextContent(
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

  // Mono-Is-Data Rule: name/version/path/action is mono, sentences are sans.
  // This dialog used to set every line, prose included, in mono.
  describe("its typography", () => {
    it("sets the path it would delete from in mono", () => {
      renderDialog();

      expect(screen.getByText(REPO_TARGET.repoPath).className).toContain(
        "font-mono",
      );
    });

    it("sets every ledger row in mono, because a target is data", () => {
      renderDialog({
        target: { kind: "global", tools: ["claude", "codex"] },
        preflight: cleanTools("claude", "codex"),
      });

      for (const name of ["Claude Code", "Codex"]) {
        expect(screen.getByText(name).className).toContain("font-mono");
      }
    });

    it("sets the lead-in as prose, because it is the sentence over the data", () => {
      renderDialog();

      expect(
        screen.getByText("Skill will be removed from:").className,
      ).toContain("font-ui");
    });

    it("sets a row's status as prose, because it is a sentence about the data", () => {
      renderDialog({ preflight: repoCheck("cannot-verify") });

      expect(
        screen.getByText("Nothing recorded — may lose work").className,
      ).toContain("font-ui");
    });

    // The ledger is the answer, the lead-in only introduces it, so the ledger
    // sits above its label on the scale. Asserted as a step, not literal sizes.
    it("steps the ledger above the lead-in that introduces it", () => {
      renderDialog();

      const leadIn = screen.getByText("Skill will be removed from:");
      // The repo scope has exactly one row, so the count also asserts the
      // ledger is not quietly listing something else.
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
      const name = screen.getByText("/Users/me/project");
      expect(stepOf(name)).toBeGreaterThanOrEqual(0);
      expect(stepOf(name)).toBeLessThan(stepOf(leadIn));
      // The second half of the step: the introducing line also drops down the
      // text ramp, so size is not carrying the difference alone.
      expect(leadIn.className).toContain("text-muted");
      expect(name.className).not.toContain("text-muted");
    });

    // The failure block used to name its problem in the panel's smallest text
    // and then explain it in the panel's largest, so the box shouted the detail
    // and whispered the headline.
    it("never names a failure more quietly than it explains it", () => {
      renderDialog({ error: FAILURE });

      const label = screen.getByText("Removal outcome unknown");
      const message = screen.getByText(FAILURE.message);
      expect(stepOf(label)).toBeGreaterThanOrEqual(0);
      expect(stepOf(label)).toBeLessThanOrEqual(stepOf(message));
      // Weight carries the label instead, so the two lines can share a size.
      expect(label.className).toContain("font-semibold");
    });
  });

  // Into the panel, and onto Cancel in particular: this dialog deletes files,
  // so Enter on open must never remove anything (ADR-0033 §6).
  it("takes focus onto Cancel when it opens", async () => {
    renderDialog();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  });

  // Without a description a screen reader hears "Remove tdd v0.5.0?, dialog"
  // and has to go hunting for the facts. Warning/failure blocks self-announce.
  describe("what it announces with the question", () => {
    const describedBy = () =>
      (screen.getByRole("dialog").getAttribute("aria-describedby") ?? "")
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");

    it("reads the lead-in and then every target it would remove from", () => {
      renderDialog();

      expect(describedBy()).toContain("Skill will be removed from:");
      expect(describedBy()).toContain(REPO_TARGET.repoPath);
    });

    it("carries the whole tool set on the global path", () => {
      // The one fact #338 exists for. Left out of the description, it is the
      // one thing a reader has to go hunting for. The ledger carries it now
      // that the sentence naming the set is gone.
      renderDialog({
        target: { kind: "global", tools: ["claude", "codex"] },
        preflight: cleanTools("claude", "codex"),
      });

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

  // Server refusal isn't a failed check — removal is already known
  // impossible, so the dialog says why and offers nothing (#385, #412).
  describe("when the check came back refused", () => {
    const refused = {
      kind: "refused" as const,
      code: "repo-not-registered" as const,
      notice: REFUSAL,
    };

    it("states the refusal for the code the server sent", () => {
      renderDialog({ preflight: refused });

      expect(screen.getByText(REFUSAL.message)).toBeInTheDocument();
    });

    it("labels the block as the thing that cannot happen", () => {
      renderDialog({ preflight: refused });

      expect(screen.getByText(REFUSAL.label)).toBeInTheDocument();
    });

    it("never says work may be lost", () => {
      // There is nothing to lose: no removal will run. Borrowing the
      // failed-check wording would warn about a cost that cannot be paid.
      renderDialog({ preflight: refused });

      const dialog = screen.getByRole("dialog");
      expect(dialog).not.toHaveTextContent(/may lose work/i);
      expect(dialog).not.toHaveTextContent(/couldn't check this copy/i);
    });

    // A ledger answers "what disappears, and where". Under a refusal nothing
    // disappears, so the question and its answer are both moot — listing
    // targets would state a consequence the server has already ruled out.
    it("lists no targets, because none of them lose anything", () => {
      renderDialog({
        target: { kind: "global", tools: ["claude", "codex"] },
        preflight: refused,
      });

      expect(screen.queryAllByRole("listitem")).toEqual([]);
    });

    it("drops the lead-in that introduced the ledger", () => {
      renderDialog({ preflight: refused });

      expect(screen.queryByText("Skill will be removed from:")).toBeNull();
    });

    // A disabled confirm still reads as a way through that is temporarily shut.
    // This one is shut for good, and a control nobody can ever press is a
    // promise the panel has no way to keep.
    it("offers no confirm control at all, not even a disabled one", () => {
      renderDialog({ preflight: refused });

      expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
    });

    it("leaves exactly one control in the footer, labelled close", () => {
      renderDialog({ preflight: refused });

      // The backdrop's dismiss button is hidden from the a11y tree, so this is
      // every control the panel offers.
      const controls = screen.getAllByRole("button");
      expect(controls.map((control) => control.textContent)).toEqual(["Close"]);
    });

    it("closes through the one control it leaves", async () => {
      const { onCancel } = renderDialog({ preflight: refused });

      await userEvent.click(screen.getByRole("button", { name: "Close" }));

      expect(onCancel).toHaveBeenCalledTimes(1);
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

    // The word that carries the meaning for a reader who never sees the ✕ or
    // the red: the glyph is decorative and hidden from the a11y tree on
    // purpose, so the label is the whole signal there (Never-Colour-Alone).
    it("names the refusal in words a screen reader reaches", () => {
      renderDialog({ preflight: refused });

      const alert = screen.getByRole("alert");
      expect(alert.querySelector("[aria-hidden='true']")).toHaveTextContent(
        "✕",
      );
      expect(
        within(alert).getByText("Repository not registered"),
      ).not.toHaveAttribute("aria-hidden");
    });

    it("carries the refusal in the panel's own outline", () => {
      // The block alone is a red box on a neutral panel; the whole screen is
      // the refusal, so the whole screen wears it.
      renderDialog({ preflight: refused });

      expect(screen.getByRole("dialog").className).toContain(
        "border-danger-border",
      );
    });

    it("describes itself with the refusal, now that it is the whole panel", () => {
      // The description pointed at the lead-in and the ledger rows, and both
      // are gone. Left empty it would leave the panel's only content resting on
      // the live region firing — so the description follows the content.
      renderDialog({ preflight: refused });

      expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBe(
        screen.getByRole("alert").id,
      );
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

  it("keeps the neutral panel outline while the removal is still on offer", () => {
    // The danger outline belongs to a panel whose news is bad, so a panel that
    // still has a question to ask must not borrow it.
    renderDialog();

    expect(screen.getByRole("dialog").className).not.toContain("danger");
  });

  it("carries a failed removal in the panel's own outline", () => {
    // The same rule the refusal follows: a red block on a neutral panel states
    // the failure more quietly than the panel states its question.
    renderDialog({ error: FAILURE });

    expect(screen.getByRole("dialog").className).toContain(
      "border-danger-border",
    );
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
      renderDialog({
        target: { kind: "global", tools: ["codex", "claude"] },
        preflight: cleanTools("codex", "claude"),
      });

      expect(
        screen.getAllByRole("listitem").map((row) => row.textContent),
      ).toEqual(["Codex", "Claude Code"]);
    });

    it("names the single detected tool when the machine has only one", () => {
      renderDialog({
        target: { kind: "global", tools: ["claude"] },
        preflight: cleanTools("claude"),
      });

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("Claude Code");
      expect(dialog).not.toHaveTextContent("Codex");
    });

    it("still carries the cost warning, now on each affected row", () => {
      renderDialog({
        target: globalTarget,
        preflight: toolChecks({
          claude: "cannot-verify",
          codex: "cannot-verify",
        }),
      });

      for (const row of screen.getAllByRole("listitem")) {
        expect(row).toHaveTextContent("Nothing recorded — may lose work");
      }
    });

    // A global removal force-deletes an undetected exclusive tool's whole
    // copy beyond apm's scoped uninstall (#390) — named on the ledger (#413).
    describe("naming what an untargeted tool's copy reclaim would also delete", () => {
      const leftover = [
        { tool: "codex" as const, path: "/Users/me/.agents/skills/tdd" },
      ];
      const oneToolTarget = { kind: "global" as const, tools: ["claude"] };

      const renderWithLeftover = () =>
        renderDialog({
          target: oneToolTarget,
          preflight: toolChecks({ claude: "none", codex: "none" }, leftover),
        });

      it("puts the leftover copy on its own row, after the detected tools", () => {
        renderWithLeftover();

        const rows = screen.getAllByRole("listitem");
        expect(rows[0]).toHaveTextContent("Claude Code");
        expect(rows[1]).toHaveTextContent("Codex");
        expect(rows).toHaveLength(2);
      });

      it("states the tool, the exact path and what happens to it on that row", () => {
        renderWithLeftover();

        const row = screen.getAllByRole("listitem")[1] as HTMLElement;
        expect(row).toHaveTextContent("Codex");
        expect(row).toHaveTextContent("/Users/me/.agents/skills/tdd");
        expect(row).toHaveTextContent("Not installed — copy deleted in full");
        // The glyph pairs the amber with a shape, so the row still reads as a
        // cost without colour.
        expect(row).toHaveTextContent("▲");
      });

      it("drops the separate block that used to say what else goes", () => {
        renderWithLeftover();

        expect(screen.getByRole("dialog")).not.toHaveTextContent(
          /this also deletes/i,
        );
      });

      it("warms the panel outline while a leftover row is on the ledger", () => {
        renderWithLeftover();

        expect(screen.getByRole("dialog").className).toContain(
          "border-line-drift",
        );
      });

      it("keeps the neutral outline when nothing is left over", () => {
        renderDialog({
          target: oneToolTarget,
          preflight: cleanTools("claude"),
        });

        expect(screen.getByRole("dialog").className).not.toContain("drift");
      });

      it("names each leftover tool when there is more than one", () => {
        renderDialog({
          target: oneToolTarget,
          preflight: toolChecks({ claude: "none", codex: "none" }, [
            ...leftover,
            { tool: "claude", path: "/Users/me/.claude/skills/tdd" },
          ]),
        });

        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveTextContent("/Users/me/.agents/skills/tdd");
        expect(dialog).toHaveTextContent("/Users/me/.claude/skills/tdd");
      });

      it("says nothing extra when there is no leftover to reclaim", () => {
        renderDialog({
          target: globalTarget,
          preflight: cleanTools("claude", "codex"),
        });

        expect(
          screen.queryByText(/copy deleted in full/i, { exact: false }),
        ).toBeNull();
        expect(screen.queryAllByRole("listitem")).toHaveLength(2);
      });

      // A live region created together with its first message announces
      // unreliably, and the check answers after the dialog is already open —
      // so the region waits, empty, from the first render (removal-trace.tsx).
      it("keeps the region mounted while the check is still running", () => {
        renderDialog({ target: oneToolTarget, preflight: CHECKING });

        expect(
          screen.getByRole("status", { name: /other copies/i }),
        ).toBeEmptyDOMElement();
      });

      // #390: a force-deleted untargeted directory gets its own announced
      // region, distinct from the local-edits check.
      it("announces the leftover rows as their own named region", () => {
        renderWithLeftover();

        const region = screen.getByRole("status", { name: /other copies/i });
        expect(region).toHaveTextContent("/Users/me/.agents/skills/tdd");
        expect(region).not.toHaveTextContent("Claude Code");
      });

      it("keeps the targeted rows in a region of their own", () => {
        // Two regions, two subjects: what the removal was aimed at, and what
        // else goes with it. Sharing one, a reader could not tell the copy they
        // asked to remove from the copy they never targeted.
        renderDialog({
          target: oneToolTarget,
          preflight: toolChecks(
            { claude: "cannot-verify", codex: "none" },
            leftover,
          ),
        });

        const targeted = screen.getByRole("status", {
          name: /removal targets/i,
        });
        expect(targeted).toHaveTextContent("Nothing recorded — may lose work");
        expect(targeted).not.toHaveTextContent(/deleted in full/i);
        expect(
          screen.getByRole("status", { name: /other copies/i }),
        ).not.toHaveTextContent(/local edits/i);
      });

      it("leaves the row static: the status slot adds no control", () => {
        renderWithLeftover();

        const row = screen.getAllByRole("listitem")[1] as HTMLElement;
        expect(within(row).queryByRole("button")).toBeNull();
        expect(row.querySelector("[tabindex]")).toBeNull();
      });

      // The leftover rows announce themselves, so they stay out of the dialog's
      // description — the rule the warning and failure blocks already follow.
      // In both channels a reader hears the same path twice.
      it("leaves the announced rows out of the dialog's description", () => {
        renderWithLeftover();

        const describedBy = screen
          .getByRole("dialog")
          .getAttribute("aria-describedby");
        const [detected, leftover] = screen.getAllByRole("listitem");
        expect(describedBy?.split(" ")).toContain(detected?.id);
        expect(describedBy?.split(" ")).not.toContain(leftover?.id);
      });
    });
  });
});
