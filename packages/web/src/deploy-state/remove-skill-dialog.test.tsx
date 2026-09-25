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

const noticeFor = (code: string): DeployStateNotice =>
  removeNotice(new HttpError(500, "unused", code));
const FAILURE = noticeFor("remove-failed");
const REFUSAL = noticeFor("repo-not-registered");

// The cockpit's type scale, largest first. Tests assert a step's position, not its size.
const SCALE = [
  "text-title",
  "text-prose",
  "text-prose",
  "text-row",
  "text-meta",
  "text-meta",
  "text-meta",
  "text-meta",
];
const stepOf = (element: HTMLElement) =>
  SCALE.findIndex((size) => element.className.includes(size));

const offers = (
  check: RemoveCheckState,
  reclaim: readonly ReclaimPreview[] = [],
): RemovePreflightView => ({ kind: "offered", check, reclaim });

const repoCheck = (
  warning: RemoveRowWarning,
  reclaim: readonly ReclaimPreview[] = [],
) => offers({ kind: "repo", warning }, reclaim);

const toolChecks = (
  warnings: Record<string, RemoveRowWarning>,
  reclaim: readonly ReclaimPreview[] = [],
) => offers({ kind: "per-tool", warnings }, reclaim);

const cleanTools = (...tools: string[]) =>
  toolChecks(Object.fromEntries(tools.map((tool) => [tool, "none"] as const)));

const CHECKING = offers({ kind: "unanswered", warning: "checking" });

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

  it("names the version being removed in the question it asks", () => {
    renderDialog({ version: "v0.5.0" });

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Remove tdd v0.5.0",
    );
  });

  it("asks without a version when the row has none to name", () => {
    renderDialog({ version: null });

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Remove tdd",
    );
  });

  it("names the primitive's type beside the question", () => {
    renderDialog();

    expect(screen.getByText("Skill")).toBeInTheDocument();
  });

  describe("its ledger of targets", () => {
    it("holds the repo path in a single row on the repo scope", () => {
      renderDialog();

      expect(screen.getAllByRole("listitem").map((r) => r.textContent)).toEqual(
        [REPO_TARGET.repoPath],
      );
    });

    it("wraps a long path mid-token rather than pushing the panel wider", () => {
      // A repo path has no spaces to break at; without this it widens the panel.
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

    // No per-tool remove: apm's uninstall has no -t, so rows have nothing to press.
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

  it("confirms with the outlined danger button", () => {
    renderDialog();

    const confirm = screen.getByRole("button", { name: /^remove/i });
    expect(confirm).toHaveClass("text-red-11", "border-red-7");
    expect(confirm).not.toHaveClass("bg-gray-12");
  });

  it("puts Cancel on the leading side of the footer", () => {
    renderDialog({ preflight: CHECKING });

    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(cancel.parentElement?.firstElementChild).toBe(cancel);
    expect(cancel.parentElement).toHaveClass("justify-between");
  });

  it("cancels without confirming", async () => {
    const { onCancel, onConfirm } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("holds both controls unpressable while the removal is in flight", () => {
    renderDialog({ isRemoving: true });

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

  it("says a retry picks up only what the failure left behind", () => {
    renderDialog({ error: FAILURE });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(FAILURE.detail ?? "");
    expect(alert).not.toHaveTextContent(/mixed state/i);
  });

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
      expect(alert.className).not.toContain("-red-");
      expect(alert).toHaveTextContent("⚠");
      expect(alert).toHaveTextContent(/Nothing removed/);
    });

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

  it("wears danger with a glyph when the removal failed, not the amber of a warning", () => {
    renderDialog({ error: FAILURE });

    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("-red-");
    expect(alert.className).not.toContain("amber");
    expect(alert).toHaveTextContent("✕");
  });

  it("says in words that the removal failed, so the colour is not the signal", () => {
    renderDialog({ error: FAILURE });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /Removal outcome unknown/,
    );
  });

  it("keeps its own label whatever the server's sentence says", () => {
    renderDialog({
      error: FAILURE,
    });

    const alert = screen.getByRole("alert");
    expect(
      within(alert).getByText("Removal outcome unknown"),
    ).toBeInTheDocument();
    expect(
      within(alert).getByText("Removal outcome unknown").className,
    ).not.toContain("font-mono");
  });

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
      expect(claude.className).not.toContain("bg-red-3");
    });

    it("fills a target it did not come off with danger, keeping its weight", () => {
      renderPartialFailure();

      const codex = rowFor("Codex");
      expect(codex).toHaveTextContent("Not removed");
      expect(codex.className).toContain("bg-red-3");
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

    it("renders the error block alone when the failure proved nothing", () => {
      renderDialog({ error: FAILED, outcome: null });

      expect(screen.getByRole("alert")).toHaveTextContent(FAILED.message);
      expect(screen.queryAllByRole("listitem")).toEqual([]);
      expect(screen.queryByText(/removal targets/i)).toBeNull();
    });

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

  describe("what the check says, on the row it is about", () => {
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

    it("puts the repo scope's aggregate answer on its single row", () => {
      renderDialog({ preflight: repoCheck("cannot-verify") });

      const rows = screen.getAllByRole("listitem");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent("Nothing recorded — may lose work");
    });

    it("leaves no separate block saying which copy was edited", () => {
      renderDialog({ preflight: repoCheck("cannot-verify") });

      expect(screen.getByRole("dialog")).not.toHaveTextContent(
        /removing it deletes them|copy them out/i,
      );
    });

    it("warms the panel outline while a row states a cost", () => {
      renderDialog({ preflight: repoCheck("cannot-verify") });

      expect(screen.getByRole("dialog").className).toContain("border-amber-7");
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
      renderDialog({ preflight: CHECKING });

      expect(
        screen.getByRole("status", { name: /local edits check/i }),
      ).toHaveTextContent(/checking/i);
    });

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
      renderDialog({ preflight: repoCheck("cannot-verify") });

      expect(screen.getByRole("dialog")).not.toHaveTextContent(/central/i);
    });

    it("claims no more about the edits than the check can prove", () => {
      renderDialog({ preflight: repoCheck("cannot-verify") });

      expect(screen.getByRole("dialog")).not.toHaveTextContent(
        /nowhere else|for good|only copy/i,
      );
    });

    it("promises no redeploy, because a redeploy pins to the latest tag", () => {
      renderDialog();

      expect(screen.getByRole("dialog")).not.toHaveTextContent(
        /deploy it again/i,
      );
    });
  });

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

    it("steps the ledger above the lead-in that introduces it", () => {
      renderDialog();

      const leadIn = screen.getByText("Skill will be removed from:");
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
      const name = screen.getByText("/Users/me/project");
      expect(stepOf(name)).toBeGreaterThanOrEqual(0);
      expect(stepOf(name)).toBeLessThan(stepOf(leadIn));
      expect(leadIn.className).toContain("text-gray-11");
      expect(name.className).not.toContain("text-gray-11");
    });

    it("never names a failure more quietly than it explains it", () => {
      renderDialog({ error: FAILURE });

      const label = screen.getByText("Removal outcome unknown");
      const message = screen.getByText(FAILURE.message);
      expect(stepOf(label)).toBeGreaterThanOrEqual(0);
      expect(stepOf(label)).toBeLessThanOrEqual(stepOf(message));
      expect(label.className).toContain("font-semibold");
    });
  });

  // This dialog deletes files, so Enter on open must never remove anything.
  it("takes focus onto Cancel when it opens", async () => {
    renderDialog();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  });

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
      renderDialog({
        target: { kind: "global", tools: ["claude", "codex"] },
        preflight: cleanTools("claude", "codex"),
      });

      expect(describedBy()).toContain("Claude Code");
      expect(describedBy()).toContain("Codex");
    });

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
      renderDialog({ preflight: refused });

      const dialog = screen.getByRole("dialog");
      expect(dialog).not.toHaveTextContent(/may lose work/i);
      expect(dialog).not.toHaveTextContent(/couldn't check this copy/i);
    });

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

    it("offers no confirm control at all, not even a disabled one", () => {
      renderDialog({ preflight: refused });

      expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
    });

    it("leaves exactly one control in the footer, labelled close", () => {
      renderDialog({ preflight: refused });

      // The backdrop's dismiss button is hidden from the a11y tree.
      const controls = screen.getAllByRole("button");
      expect(controls.map((control) => control.textContent)).toEqual(["Close"]);
    });

    it("closes through the one control it leaves", async () => {
      const { onCancel } = renderDialog({ preflight: refused });

      await userEvent.click(screen.getByRole("button", { name: "Close" }));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("wears danger red with a glyph, not the amber of lost work", () => {
      renderDialog({ preflight: refused });

      const alert = screen.getByRole("alert");
      expect(alert.className).toContain("-red-");
      expect(alert).toHaveTextContent("✕");
    });

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
      renderDialog({ preflight: refused });

      expect(screen.getByRole("dialog").className).toContain("border-red-7");
    });

    it("describes itself with the refusal, now that it is the whole panel", () => {
      renderDialog({ preflight: refused });

      expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBe(
        screen.getByRole("alert").id,
      );
    });

    it("drops the promise that the skill can be redeployed", () => {
      renderDialog({ preflight: refused });

      expect(screen.getByRole("dialog")).not.toHaveTextContent(
        /deploy it again/i,
      );
    });
  });

  it("keeps the neutral panel outline while the removal is still on offer", () => {
    renderDialog();

    expect(screen.getByRole("dialog").className).not.toContain("-red-");
  });

  it("carries a failed removal in the panel's own outline", () => {
    renderDialog({ error: FAILURE });

    expect(screen.getByRole("dialog").className).toContain("border-red-7");
  });

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
          "border-amber-7",
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

      // A live region created with its first message announces unreliably, so the
      // region must exist, empty, from the first render.
      it("keeps the region mounted while the check is still running", () => {
        renderDialog({ target: oneToolTarget, preflight: CHECKING });

        expect(
          screen.getByRole("status", { name: /other copies/i }),
        ).toBeEmptyDOMElement();
      });

      it("announces the leftover rows as their own named region", () => {
        renderWithLeftover();

        const region = screen.getByRole("status", { name: /other copies/i });
        expect(region).toHaveTextContent("/Users/me/.agents/skills/tdd");
        expect(region).not.toHaveTextContent("Claude Code");
      });

      it("keeps the targeted rows in a region of their own", () => {
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
