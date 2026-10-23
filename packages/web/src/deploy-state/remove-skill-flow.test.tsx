import type {
  ReclaimPreview,
  RemoveCheck,
  RemoveToolCheck,
  RemoveWarning,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectVisibleCause,
  jsonResponse,
  renderWithQuery,
  sentence,
} from "../test-utils";
import { ToastHost } from "../ui/toast";
import { RemoveSkillFlow } from "./remove-skill-flow";

// The flow as its callers mount it, with only `fetch` stubbed. Claims a row
// already makes through its menu live in remove-skill-row*.test.tsx.

afterEach(() => {
  vi.unstubAllGlobals();
  toast.dismiss();
});

type Target = Parameters<typeof RemoveSkillFlow>[0]["target"];
type Answer = () => Response | Promise<Response>;

const REPO_TARGET: Target = {
  kind: "repo",
  repoPath: "/Users/me/project",
  name: "…/me/project",
};
const GLOBAL_TARGET: Target = { kind: "global", tools: ["claude", "codex"] };
const ONE_TOOL: Target = { kind: "global", tools: ["claude"] };
const RECEIPT = "b".repeat(64);
const LEFTOVER: ReclaimPreview[] = [
  { tool: "codex", path: "/Users/me/.agents/skills/tdd" },
];

const never: Answer = () => new Promise<Response>(() => {});
const removed =
  (fields: Record<string, unknown> = {}): Answer =>
  () =>
    jsonResponse({
      removed: { type: "skill", name: "tdd", version: "v0.5.0", ...fields },
    });

const answer =
  (check: RemoveCheck, previews: ReclaimPreview[] = []): Answer =>
  () =>
    jsonResponse({
      check,
      reclaim:
        previews.length === 0 ? null : { previews, token: "a".repeat(64) },
      receipt: RECEIPT,
    });
const repoCheck = (warning: RemoveWarning | null = null) =>
  answer({ scope: "repo", warning });
const toolChecks = (
  warnings: Partial<Record<RemoveToolCheck["tool"], RemoveWarning | null>>,
  previews: ReclaimPreview[] = [],
) =>
  answer(
    {
      scope: "global",
      // Object.entries widens the keys to string; they came in as tools.
      tools: (
        Object.entries(warnings) as [
          RemoveToolCheck["tool"],
          RemoveWarning | null,
        ][]
      ).map(([tool, warning]) => ({ tool, warning })),
    },
    previews,
  );
const cleanTools = (...tools: RemoveToolCheck["tool"][]) =>
  toolChecks(Object.fromEntries(tools.map((tool) => [tool, null])));
const failedWith =
  (body: unknown, status: number): Answer =>
  () =>
    jsonResponse(body, status);
const REFUSED = failedWith({ error: "repo-not-registered" }, 403);
const CHECK_FAILED = failedWith({ error: "preflight-failed" }, 502);
const REMOVE_FAILED = failedWith({ error: "remove-failed" }, 502);
const MAY_LOSE: RemoveWarning = "cannot-verify-local-edits";

function renderFlow({
  target = REPO_TARGET,
  version = "v0.5.0" as string | null,
  preflight = repoCheck(),
  remove = removed(),
}: {
  target?: Target;
  version?: string | null;
  preflight?: Answer;
  remove?: Answer;
} = {}) {
  const fetchMock = vi.fn(async (path: string) =>
    path === "/api/deploy/remove/preflight" ? preflight() : remove(),
  );
  vi.stubGlobal("fetch", fetchMock);
  const onCancel = vi.fn();
  const onRemoved = vi.fn();
  const { unmount } = renderWithQuery(
    <>
      <RemoveSkillFlow
        skillName="tdd"
        version={version}
        target={target}
        onCancel={onCancel}
        onRemoved={onRemoved}
      />
      <ToastHost />
    </>,
  );
  const removeCalls = () =>
    fetchMock.mock.calls.filter(([path]) => path === "/api/deploy/remove");
  return { onCancel, onRemoved, removeCalls, unmount };
}

// The confirm, once the check has answered and offered the removal.
const answered = () =>
  waitFor(() => {
    const button = screen.getByRole("button", { name: "Remove skill" });
    expect(button).not.toHaveAttribute("aria-disabled");
    return button;
  });

async function confirm() {
  await userEvent.click(await answered());
}

async function fail() {
  await confirm();
  return screen.findByRole("alert");
}

// A removal that never answers, so the in-flight dialog can be read.
async function removing() {
  await confirm();
  return screen.findByRole("button", { name: /removing/i });
}

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

const rowFor = (name: string) =>
  screen
    .getAllByRole("listitem")
    .find((row) => row.textContent?.includes(name)) as HTMLElement;

const footerClose = () =>
  screen.getAllByRole("button", { name: "Close" }).at(-1) as HTMLElement;

describe("RemoveSkillFlow", () => {
  it("asks without a version when the row has none to name", async () => {
    renderFlow({ version: null });

    expect(
      await screen.findByRole("heading", { level: 2, name: "Remove tdd" }),
    ).toBeInTheDocument();
  });

  it("drops the type word beside the title", async () => {
    renderFlow();
    await answered();

    expect(screen.queryByText("Skill")).toBeNull();
  });

  // This dialog deletes files, so Enter on open must never remove anything.
  it("takes focus onto Cancel when it opens", async () => {
    renderFlow();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(),
    );
  });

  describe("its ledger of targets", () => {
    it("names the repository in a single row, as the table does", async () => {
      renderFlow();
      await answered();

      expect(screen.getAllByRole("listitem").map((r) => r.textContent)).toEqual(
        ["…/me/project"],
      );
    });

    it("keeps the repository on one line, its full path on hover", async () => {
      renderFlow();
      await answered();

      const name = screen.getByText("…/me/project");
      expect(name).toHaveClass("truncate");
      expect(name).toHaveAttribute("title", "/Users/me/project");
    });

    it("introduces the ledger with one lead-in and states what stays", async () => {
      renderFlow();
      await answered();

      expect(screen.getByText("Removes the skill from:")).toBeInTheDocument();
      expect(
        screen.getByText(
          "The Harness keeps the skill. To add it back, select Deploy skill.",
        ),
      ).toBeInTheDocument();
    });

    // No per-tool remove: apm's uninstall has no -t, so rows have nothing to press.
    it("gives no row anything to press, focus, read as a control, or a glyph", async () => {
      renderFlow({
        target: GLOBAL_TARGET,
        preflight: cleanTools("claude", "codex"),
      });
      await answered();

      for (const row of screen.getAllByRole("listitem")) {
        expect(
          row.querySelector("button, a, input, [role='button']"),
        ).toBeNull();
        expect(row.querySelector("[tabindex]")).toBeNull();
        expect(row).not.toHaveAttribute("tabindex");
        expect(row).not.toHaveAttribute("onclick");
        expect(row.textContent).not.toMatch(/[▲⚠✕✓·•→]/);
      }
    });

    it("drops the lockfile line and the per-tool note", async () => {
      renderFlow({
        target: GLOBAL_TARGET,
        preflight: cleanTools("claude", "codex"),
      });
      await answered();

      const dialog = screen.getByRole("dialog");
      expect(dialog).not.toHaveTextContent(/lockfile entry/i);
      expect(dialog).not.toHaveTextContent(/per-tool/i);
    });
  });

  describe("its footer controls", () => {
    it("confirms and cancels with fixed labels that carry no name", async () => {
      renderFlow();

      const confirm = await answered();
      expect(confirm).toHaveTextContent("Remove skill");
      expect(confirm).not.toHaveTextContent("tdd");
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveTextContent(
        "Cancel",
      );
    });

    it("confirms with the outlined danger button", async () => {
      renderFlow();

      const confirm = await answered();
      expect(confirm).toHaveClass("text-red-11", "border-red-7");
      expect(confirm).not.toHaveClass("bg-gray-12");
    });

    it("puts Cancel on the leading side of the footer", () => {
      renderFlow({ preflight: never });

      const cancel = screen.getByRole("button", { name: "Cancel" });
      expect(cancel.parentElement?.firstElementChild).toBe(cancel);
      expect(cancel.parentElement).toHaveClass("justify-between");
    });

    it("cancels through the host", async () => {
      const { onCancel } = renderFlow();
      await answered();

      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("while the removal is in flight", () => {
    it("holds both controls unpressable, naming nobody", async () => {
      renderFlow({ remove: never });

      const busy = await removing();
      expect(busy).toHaveAttribute("aria-disabled", "true");
      expect(busy).not.toHaveTextContent("tdd");
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    });

    it("cannot be dismissed with Escape", async () => {
      const { onCancel } = renderFlow({ remove: never });
      await removing();

      await userEvent.keyboard("{Escape}");

      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe("once a removal has failed", () => {
    it("offers close and the same confirm, and nothing else", async () => {
      renderFlow({ remove: REMOVE_FAILED });

      // A retry picks up only what the failure left behind.
      expect(await fail()).not.toHaveTextContent(/mixed state/i);

      expect(footerClose()).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Remove skill" }),
      ).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Confirm removal" }),
      ).toBeNull();
    });

    it("states one failure only, directly above the footer", async () => {
      renderFlow({ remove: REMOVE_FAILED });
      await fail();

      const alerts = screen.getAllByRole("alert");
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.compareDocumentPosition(footerClose())).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it("wears danger with a glyph and its own label, whatever the server said", async () => {
      renderFlow({
        remove: failedWith(
          { error: "remove-failed", message: "apm printed this" },
          502,
        ),
      });

      const alert = await fail();
      expect(alert.className).toContain("-red-");
      expect(alert.className).not.toContain("amber");
      expect(alert).toHaveTextContent("✕");
      const label = within(alert).getByText("Removal outcome unknown");
      expect(label.className).not.toContain("font-mono");
      expect(label.className).toContain("font-semibold");
      expect(alert).not.toHaveTextContent("apm printed this");
    });

    it("never names a failure more quietly than it explains it", async () => {
      renderFlow({ remove: REMOVE_FAILED });
      await fail();

      const label = screen.getByText("Removal outcome unknown");
      const message = screen.getByText(
        "The copy may be gone or may still be there. Confirm the removal again to delete whatever is left.",
      );
      expect(stepOf(label)).toBeGreaterThanOrEqual(0);
      expect(stepOf(label)).toBeLessThanOrEqual(stepOf(message));
    });
  });

  describe("what the failed removal came off, target by target", () => {
    const partial = {
      scope: "global",
      tools: [
        { tool: "claude", state: "removed" },
        { tool: "codex", state: "not-removed" },
      ],
    };
    const partialFailure = failedWith(
      { error: "remove-failed", outcome: partial },
      502,
    );
    const groupOf = (name: string) =>
      screen.getByText(name).closest("section")?.querySelector("h4")
        ?.textContent;

    const renderPartialFailure = (preflight = cleanTools("claude", "codex")) =>
      renderFlow({
        target: GLOBAL_TARGET,
        preflight,
        remove: partialFailure,
      });

    it("counts the targets it came off in the report's heading, the ledger gone", async () => {
      renderPartialFailure();
      await fail();

      expect(
        screen.getByRole("heading", {
          level: 3,
          name: "Removed from 1 of 2 targets",
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText("Removes the skill from:")).toBeNull();
    });

    it("puts each target under its outcome, the failed one first", async () => {
      renderPartialFailure();
      await fail();

      expect(groupOf("Codex")).toBe("✕Not removed1");
      expect(groupOf("Claude Code")).toBe("✓Removed1");
      expect(
        screen.getAllByRole("listitem").map((row) => row.textContent),
      ).toEqual(["Codex", "Claude Code"]);
    });

    it("never reads a target the probe could not answer for as removed", async () => {
      renderFlow({
        remove: failedWith(
          {
            error: "remove-failed",
            outcome: { scope: "repo", state: "unknown" },
          },
          502,
        ),
      });
      await fail();

      expect(groupOf("…/me/project")).toBe("⚠Outcome unknown1");
    });

    it("drops a leftover copy the report could not answer for", async () => {
      renderPartialFailure(
        toolChecks({ claude: null, codex: null }, [
          { tool: "claude", path: "/Users/me/.claude/skills/tdd" },
        ]),
      );
      await fail();

      expect(screen.getByRole("dialog")).not.toHaveTextContent(
        "/Users/me/.claude/skills/tdd",
      );
    });

    it("drops the cost it named before the attempt", async () => {
      renderPartialFailure(toolChecks({ claude: null, codex: MAY_LOSE }));
      await fail();

      expect(screen.getByRole("dialog")).not.toHaveTextContent(
        /may lose work/i,
      );
    });

    it("still offers the same confirm beside the report", async () => {
      renderPartialFailure();
      await fail();

      expect(
        screen.getByRole("button", { name: "Remove skill" }),
      ).toBeEnabled();
    });

    // Nothing validates the failure's body: a report this build cannot read is
    // dropped whole, never drawn from a guess.
    it("states the failure alone when the answer proved nothing it can read", async () => {
      const outcomes = [
        undefined,
        { scope: "repo", state: "maybe" },
        { scope: "global", tools: [{ tool: "claude", state: "probably" }] },
        { scope: "global", tools: [{ tool: "cursor", state: "removed" }] },
        { scope: "repo" },
        { scope: "global" },
        { scope: "elsewhere", state: "removed" },
        "removed",
      ];
      for (const outcome of outcomes) {
        const { unmount } = renderFlow({
          remove: failedWith({ error: "remove-failed", outcome }, 502),
        });

        expect(await fail()).toHaveTextContent("Removal outcome unknown");
        expect(screen.queryAllByRole("listitem")).toEqual([]);
        unmount();
      }
    });

    it("states the failure alone when the request never reached the server", async () => {
      renderFlow({
        remove: () => Promise.reject(new TypeError("network down")),
      });

      expect(await fail()).toHaveTextContent(
        "Nothing confirmed the removal. Check the target on the Deploy-state screen to see whether the skill is still deployed.",
      );
      expect(screen.queryAllByRole("listitem")).toEqual([]);
    });
  });

  describe("when the copy changed since the check", () => {
    const restating = (body: Record<string, unknown>) => {
      let attempts = 0;
      return () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse({ error: "cost-not-acknowledged", ...body }, 409)
          : removed()();
      };
    };
    // A fresh counter per test: each one's first attempt is refused.
    const restated = () =>
      restating({
        check: { scope: "repo", warning: MAY_LOSE },
        receipt: "c".repeat(64),
      });

    it("wears the amber of a cost, never the danger of a failure", async () => {
      renderFlow({ remove: restated() });

      const alert = await fail();
      expect(alert.className).toContain("amber");
      expect(alert.className).not.toContain("-red-");
      expect(alert).toHaveTextContent("⚠");
      expect(alert).toHaveTextContent(
        "Removal not confirmed" +
          "Nothing was removed. A copy changed after the check. Read the list again, then select Remove skill.",
      );
    });

    it("carries the one confirm in its panel, and Cancel still leaves", async () => {
      renderFlow({ remove: restated() });

      const alert = await fail();
      const confirm = screen.getByRole("button", { name: "Remove skill" });
      expect(alert).toContainElement(confirm);
      expect(confirm).toBeEnabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    });

    it("describes ✕ by the panel's busy label while that confirm runs", async () => {
      const first = restated();
      let attempts = 0;
      renderFlow({
        remove: () => {
          attempts += 1;
          return attempts === 1 ? first() : never();
        },
      });

      const alert = await fail();
      await userEvent.click(
        within(alert).getByRole("button", { name: "Remove skill" }),
      );

      await waitFor(() =>
        expectVisibleCause(
          // The header ✕ comes first; the leave control is the last Close.
          screen.getAllByRole("button", { name: "Close" })[0] as HTMLElement,
          "Removing…",
        ),
      );
    });

    // All or nothing: a fresh cost paired with an older consent is #364.
    it("states a failure, offering no new consent, for a restatement it cannot read", async () => {
      for (const body of [
        { check: { scope: "repo", warning: null } },
        {
          check: { scope: "repo", warning: "some-future-warning" },
          receipt: "c".repeat(64),
        },
      ]) {
        const { unmount } = renderFlow({ remove: restating(body) });

        const alert = await fail();
        expect(alert.className).toContain("-red-");
        expect(alert).not.toContainElement(
          screen.getByRole("button", { name: "Remove skill" }),
        );
        unmount();
      }
    });

    it("ignores a priced body on any other refusal", async () => {
      renderFlow({
        remove: failedWith(
          {
            error: "remove-failed",
            check: { scope: "repo", warning: MAY_LOSE },
            receipt: "c".repeat(64),
          },
          409,
        ),
      });

      const alert = await fail();
      expect(alert).toHaveTextContent("Removal outcome unknown");
      expect(alert.className).not.toContain("amber");
    });
  });

  describe("what the check says, on the row it is about", () => {
    it("marks only the tool whose copy carries a cost, in amber with its glyph", async () => {
      renderFlow({
        target: GLOBAL_TARGET,
        preflight: toolChecks({ claude: null, codex: MAY_LOSE }),
      });
      await answered();

      expect(rowFor("Codex")).toHaveTextContent(
        "Nothing recorded — may lose work",
      );
      expect(rowFor("Codex")).not.toHaveTextContent(/local edits/i);
      expect(rowFor("Codex").className).toContain("amber");
      expect(rowFor("Codex")).toHaveTextContent("⚠");
      expect(rowFor("Claude Code")).not.toHaveTextContent(/may lose work/i);
      expect(rowFor("Claude Code").className).not.toContain("amber");
      expect(rowFor("Claude Code")).not.toHaveTextContent("⚠");
    });

    it("keeps a check that never ran apart from a missing baseline", async () => {
      renderFlow({
        target: GLOBAL_TARGET,
        preflight: toolChecks({ claude: "check-did-not-run", codex: null }),
      });
      await answered();

      const row = rowFor("Claude Code");
      expect(row).toHaveTextContent("Check did not run — may lose work");
      expect(row).not.toHaveTextContent(/nothing recorded/i);
    });

    it("reads a tool the answer left out as unchecked, never as clean", async () => {
      renderFlow({
        target: GLOBAL_TARGET,
        preflight: toolChecks({ claude: null }),
      });
      await answered();

      expect(rowFor("Codex")).toHaveTextContent("Check did not run");
      expect(rowFor("Claude Code")).not.toHaveTextContent("Check did not run");
    });

    it("states a failed check on every row, because it answered for none", async () => {
      renderFlow({ target: GLOBAL_TARGET, preflight: CHECK_FAILED });
      await answered();

      for (const row of screen.getAllByRole("listitem")) {
        expect(row).toHaveTextContent("Check did not run — may lose work");
      }
    });

    it("puts the repo scope's answer on its single row, with no separate block", async () => {
      renderFlow({ preflight: repoCheck(MAY_LOSE) });
      await answered();

      const rows = screen.getAllByRole("listitem");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent("Nothing recorded — may lose work");
      expect(screen.getByRole("dialog")).not.toHaveTextContent(
        /removing it deletes them|copy them out/i,
      );
    });

    it("shows no cost and keeps the neutral outline once the copy came back clean", async () => {
      renderFlow({ preflight: repoCheck() });

      expect(await answered()).not.toHaveAttribute("aria-disabled");
      const dialog = screen.getByRole("dialog");
      expect(dialog.className).not.toContain("drift");
      expect(dialog).not.toHaveTextContent(
        /may lose work|deleted too|deleted in full/i,
      );
    });

    it("leaves the confirm usable when the check did not run on the copy", async () => {
      const { removeCalls } = renderFlow({
        preflight: repoCheck("check-did-not-run"),
      });

      await confirm();

      await waitFor(() => expect(removeCalls()).toHaveLength(1));
    });
  });

  describe("while the check is still running", () => {
    it("leaves every row plain, with no fill and no glyph", () => {
      renderFlow({ target: GLOBAL_TARGET, preflight: never });

      for (const row of screen.getAllByRole("listitem")) {
        expect(row.className).not.toContain("amber");
        expect(row).not.toHaveTextContent("⚠");
        expect(row).not.toHaveTextContent(/may lose work|deleted too/i);
      }
      expect(screen.getByRole("dialog").className).not.toContain("drift");
    });

    it("holds the confirm, naming the check as its cause, and leaves cancel usable", async () => {
      const { removeCalls } = renderFlow({ preflight: never });

      const confirm = screen.getByRole("button", { name: "Remove skill" });
      expectVisibleCause(confirm, "Checking for local edits…");
      await userEvent.click(confirm);
      expect(removeCalls()).toEqual([]);
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    });
  });

  describe("its voice", () => {
    it("addresses nobody as 'you' or 'we', in any state", async () => {
      const leftover: ReclaimPreview[] = [
        { tool: "claude", path: "/Users/me/.claude/skills/tdd" },
      ];
      const states: [Answer, () => Promise<unknown>][] = [
        [never, async () => undefined],
        [CHECK_FAILED, answered],
        ...([null, MAY_LOSE, "check-did-not-run"] as const).map(
          (warning) =>
            [
              toolChecks({ claude: warning, codex: warning }, leftover),
              answered,
            ] as [Answer, () => Promise<unknown>],
        ),
        [REFUSED, () => screen.findByRole("alert")],
      ];

      for (const [preflight, settled] of states) {
        const { unmount } = renderFlow({ target: GLOBAL_TARGET, preflight });
        await settled();

        expect(screen.getByRole("dialog").textContent).not.toMatch(
          /\b(you|your|we|our)\b/i,
        );
        unmount();
      }
    });

    it("claims no more about the edits than the check can prove", async () => {
      renderFlow({ preflight: repoCheck(MAY_LOSE) });
      await answered();

      const dialog = screen.getByRole("dialog");
      expect(dialog).not.toHaveTextContent(/central/i);
      expect(dialog).not.toHaveTextContent(/nowhere else|for good|only copy/i);
    });

    it("promises no redeploy, because a redeploy pins to the latest tag", async () => {
      renderFlow();
      await answered();

      expect(screen.getByRole("dialog")).not.toHaveTextContent(
        /deploy it again/i,
      );
    });
  });

  describe("its typography", () => {
    it("sets names in Geist and sentences as prose", async () => {
      renderFlow({
        target: GLOBAL_TARGET,
        preflight: toolChecks({ claude: MAY_LOSE, codex: null }),
      });
      await answered();

      for (const name of ["Claude Code", "Codex"]) {
        expect(screen.getByText(name).className).not.toContain("font-mono");
      }
      expect(screen.getByText("Removes the skill from:").className).toContain(
        "font-ui",
      );
      expect(
        screen.getByText("Nothing recorded — may lose work").className,
      ).toContain("font-ui");
    });

    it("steps the ledger above the lead-in that introduces it", async () => {
      renderFlow();
      await answered();

      const leadIn = screen.getByText("Removes the skill from:");
      const name = screen.getByText("…/me/project");
      expect(name.className).not.toContain("font-mono");
      expect(stepOf(name)).toBeGreaterThanOrEqual(0);
      expect(stepOf(name)).toBeLessThan(stepOf(leadIn));
      expect(leadIn.className).toContain("text-gray-11");
      expect(name.className).not.toContain("text-gray-11");
    });
  });

  describe("what it announces with the question", () => {
    const describedIds = () =>
      (screen.getByRole("dialog").getAttribute("aria-describedby") ?? "").split(
        " ",
      );
    const describedBy = () =>
      describedIds()
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");

    it("reads the lead-in and then every target, pointing at nothing off screen", async () => {
      renderFlow();
      await answered();

      expect(describedBy()).toContain("Removes the skill from:");
      expect(describedBy()).toContain("…/me/project");
      for (const id of describedIds()) {
        expect(document.getElementById(id)).not.toBeNull();
      }
    });

    it("carries the whole tool set on the global path", async () => {
      renderFlow({
        target: GLOBAL_TARGET,
        preflight: cleanTools("claude", "codex"),
      });
      await answered();

      expect(describedBy()).toContain("Claude Code");
      expect(describedBy()).toContain("Codex");
    });
  });

  describe("when the check came back refused", () => {
    const refusedOn = async (target: Target = REPO_TARGET) => {
      const rendered = renderFlow({ target, preflight: REFUSED });
      return { ...rendered, alert: await screen.findByRole("alert") };
    };

    it("labels the block, in red with a glyph a screen reader skips", async () => {
      const { alert } = await refusedOn();

      expect(alert.className).toContain("-red-");
      expect(alert.querySelector("[aria-hidden='true']")).toHaveTextContent(
        "✕",
      );
      expect(
        within(alert).getByText("Repository not registered"),
      ).not.toHaveAttribute("aria-hidden");
      expect(alert).toHaveTextContent(
        "Select Register repository on the Repositories screen, then remove again.",
      );
    });

    it("lists no target and promises nothing, because nothing is lost", async () => {
      await refusedOn(GLOBAL_TARGET);

      const dialog = screen.getByRole("dialog");
      expect(screen.queryAllByRole("listitem")).toEqual([]);
      expect(screen.queryByText("Removes the skill from:")).toBeNull();
      expect(dialog).not.toHaveTextContent(/couldn't check this copy/i);
      expect(dialog).not.toHaveTextContent(/deploy it again/i);
    });

    it("leaves exactly one control in the footer, and it closes", async () => {
      const { onCancel } = await refusedOn();

      expect(
        screen.getAllByRole("button").map((control) => control.textContent),
      ).toEqual(["", "Close"]);
      await userEvent.click(footerClose());
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("describes itself with the refusal, now that it is the whole panel", async () => {
      const { alert } = await refusedOn();

      expect(screen.getByRole("dialog").getAttribute("aria-describedby")).toBe(
        alert.id,
      );
    });
  });

  describe("on the global target", () => {
    it("names the tools themselves, never a summary or a path", async () => {
      renderFlow({
        target: GLOBAL_TARGET,
        preflight: cleanTools("claude", "codex"),
      });
      await answered();

      const dialog = screen.getByRole("dialog");
      expect(dialog).not.toHaveTextContent(/every detected tool/i);
      expect(dialog).not.toHaveTextContent("/Users/me/project");
    });

    it("lists one row per detected tool, in the order it was handed them", async () => {
      renderFlow({
        target: { kind: "global", tools: ["codex", "claude"] },
        preflight: cleanTools("codex", "claude"),
      });
      await answered();

      expect(
        screen.getAllByRole("listitem").map((row) => row.textContent),
      ).toEqual(["Codex", "Claude Code"]);
    });

    it("names the single detected tool when the machine has only one", async () => {
      renderFlow({ target: ONE_TOOL, preflight: cleanTools("claude") });
      await answered();

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveTextContent("Claude Code");
      expect(dialog).not.toHaveTextContent("Codex");
    });

    describe("naming what an untargeted tool's copy reclaim would also delete", () => {
      const withLeftover = (
        warnings: Parameters<typeof toolChecks>[0] = {
          claude: null,
          codex: null,
        },
      ) =>
        renderFlow({
          target: ONE_TOOL,
          preflight: toolChecks(warnings, LEFTOVER),
        });

      it("puts the leftover copy on its own static row, after the detected tools", async () => {
        withLeftover();
        await answered();

        const rows = screen.getAllByRole("listitem");
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent("Claude Code");
        const row = rows[1] as HTMLElement;
        expect(row).toHaveTextContent("Codex");
        expect(row).toHaveTextContent("/Users/me/.agents/skills/tdd");
        expect(row).toHaveTextContent("Not installed — copy deleted in full");
        expect(row).toHaveTextContent("⚠");
        expect(within(row).queryByRole("button")).toBeNull();
        expect(row.querySelector("[tabindex]")).toBeNull();
        expect(screen.getByRole("dialog")).not.toHaveTextContent(
          /this also deletes/i,
        );
      });

      it("names each leftover tool when there is more than one", async () => {
        renderFlow({
          target: ONE_TOOL,
          preflight: toolChecks({ claude: null, codex: null }, [
            ...LEFTOVER,
            { tool: "claude", path: "/Users/me/.claude/skills/tdd" },
          ]),
        });
        await answered();

        const dialog = screen.getByRole("dialog");
        expect(dialog).toHaveTextContent("/Users/me/.agents/skills/tdd");
        expect(dialog).toHaveTextContent("/Users/me/.claude/skills/tdd");
      });

      it("says nothing extra, in the neutral outline, when nothing is left over", async () => {
        renderFlow({
          target: GLOBAL_TARGET,
          preflight: cleanTools("claude", "codex"),
        });
        await answered();

        expect(screen.queryByText(/copy deleted in full/i)).toBeNull();
        expect(screen.getAllByRole("listitem")).toHaveLength(2);
        expect(screen.getByRole("dialog").className).not.toContain("drift");
      });

      // A live region created with its first message announces unreliably, so the
      // region must exist, empty, from the first render.
      it("keeps the region mounted while the check is still running", () => {
        renderFlow({ target: ONE_TOOL, preflight: never });

        expect(
          screen.getByRole("status", { name: /other copies/i }),
        ).toBeEmptyDOMElement();
      });

      it("announces the leftover and targeted rows as regions of their own", async () => {
        withLeftover({ claude: MAY_LOSE, codex: null });
        await answered();

        const other = screen.getByRole("status", { name: /other copies/i });
        expect(other).toHaveTextContent("/Users/me/.agents/skills/tdd");
        expect(other).not.toHaveTextContent("Claude Code");
        expect(other).not.toHaveTextContent(/may lose work/i);
        const targeted = screen.getByRole("status", {
          name: /removal targets/i,
        });
        expect(targeted).toHaveTextContent("Nothing recorded — may lose work");
        expect(targeted).not.toHaveTextContent(/deleted in full/i);
      });

      it("leaves the announced rows out of the dialog's description", async () => {
        withLeftover();
        await answered();

        const describedBy = screen
          .getByRole("dialog")
          .getAttribute("aria-describedby");
        const [detected, leftover] = screen.getAllByRole("listitem");
        expect(describedBy?.split(" ")).toContain(detected?.id);
        expect(describedBy?.split(" ")).not.toContain(leftover?.id);
      });
    });
  });

  describe("announcing the removal", () => {
    it("keeps a long repo label whole", async () => {
      const name = "…/client-work/a-repository-with-a-very-long-name";
      renderFlow({
        target: { kind: "repo", repoPath: "/Users/me/x", name },
      });
      await confirm();

      expect(
        await screen.findByText(sentence(`Removed tdd v0.5.0 from ${name}.`)),
      ).toBeInTheDocument();
    });

    it("names the tools the user confirmed when the server named none", async () => {
      const { onRemoved } = renderFlow({
        target: ONE_TOOL,
        preflight: cleanTools("claude"),
      });
      await confirm();

      expect(
        await screen.findByText(
          sentence("Removed tdd v0.5.0 from Claude Code."),
        ),
      ).toBeInTheDocument();
      expect(onRemoved).toHaveBeenCalledTimes(1);
    });

    it("names every detected tool when the server reached an empty set", async () => {
      renderFlow({
        target: ONE_TOOL,
        preflight: cleanTools("claude"),
        remove: removed({ scope: { kind: "global", tools: [] } }),
      });
      await confirm();

      expect(
        await screen.findByText(
          sentence("Removed tdd v0.5.0 from every detected tool."),
        ),
      ).toBeInTheDocument();
    });
  });
});
