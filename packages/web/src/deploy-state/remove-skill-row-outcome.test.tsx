import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONFIRM,
  clearToasts,
  jsonResponse,
  openRemoveDialog,
  REPO_NAME,
  renderRow,
  screen,
  stubFetch,
  tdd,
  userEvent,
} from "./remove-skill-row-test-helpers";

// Split from one 32-test file (#723) — see remove-skill-row.test.tsx.

afterEach(() => {
  vi.unstubAllGlobals();
  clearToasts();
});

// A removal takes its own row off the screen, so absence is the only evidence
// left behind. The card says what went instead (#383).
describe("removing a deployed skill from a row", () => {
  describe("announcing the outcome", () => {
    it("names the skill, its version and the target once the removal lands", async () => {
      stubFetch(null);
      renderRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      expect(
        await screen.findByText(`Removed tdd v0.5.0 from ${REPO_NAME}.`),
      ).toBeInTheDocument();
    });

    it("announces it without stealing focus", async () => {
      stubFetch(null);
      renderRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      const announcement = await screen.findByText(
        `Removed tdd v0.5.0 from ${REPO_NAME}.`,
      );
      // Read out where it stands, and focus goes back to the ⋮ the reader
      // left it on, never to the announcement (#1124).
      expect(announcement.closest("[aria-live]")).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "Actions for tdd" }),
      ).toHaveFocus();
      expect(announcement.closest("[aria-live]")).not.toContainElement(
        document.activeElement as HTMLElement,
      );
    });

    // The row's version can be stale by the time the user confirms — another
    // deploy may have moved it while the confirmation was open. The trace states
    // what the server actually removed, never what the screen happened to show.
    it("names the version the server removed, not the one the row showed", async () => {
      stubFetch(null, () =>
        jsonResponse(
          { removed: { type: "skill", name: "tdd", version: "v0.9.0" } },
          200,
        ),
      );
      renderRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      expect(
        await screen.findByText(`Removed tdd v0.9.0 from ${REPO_NAME}.`),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(`Removed tdd v0.5.0 from ${REPO_NAME}.`),
      ).not.toBeInTheDocument();
    });

    // One toast per removal, so a second success never re-reads the first and
    // never replaces it on screen.
    it("gives each removal its own line, the earlier one still on screen", async () => {
      const jobs = { type: "skill" as const, name: "jobs", version: "v1.2.0" };
      // Each removal is answered for the skill it named, so the two traces
      // cannot be told apart by accident.
      vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
        if (path === "/api/deploy/remove/preflight") {
          return jsonResponse(
            { check: { scope: "repo", warning: null }, reclaim: null },
            200,
          );
        }
        const { name } = JSON.parse(String(init.body));
        const version = name === "tdd" ? "v0.5.0" : "v1.2.0";
        return jsonResponse({ removed: { type: "skill", name, version } }, 200);
      });
      renderRow({
        primitives: [tdd, jobs],
      });

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
      await screen.findByText(`Removed tdd v0.5.0 from ${REPO_NAME}.`);

      await openRemoveDialog("jobs");
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
      await screen.findByText(`Removed jobs v1.2.0 from ${REPO_NAME}.`);

      expect(
        screen.getByText(`Removed tdd v0.5.0 from ${REPO_NAME}.`),
      ).toBeInTheDocument();
      expect(
        screen.getByText(`Removed jobs v1.2.0 from ${REPO_NAME}.`),
      ).toBeInTheDocument();
    });

    // The detected tool set is probed server-side when the removal runs, so a
    // tool appearing while the confirmation is open changes the real scope. The
    // trace names the set apm actually reached, not the one the card knew.
    it("names the tools the server reached, not the ones the card knew", async () => {
      stubFetch(null, () =>
        jsonResponse(
          {
            removed: {
              type: "skill",
              name: "tdd",
              version: "v0.5.0",
              scope: { kind: "global", tools: ["claude", "codex"] },
            },
          },
          200,
        ),
      );
      renderRow({ target: { kind: "global", tools: ["claude"] } });

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      expect(
        await screen.findByText(
          "Removed tdd v0.5.0 from Claude Code and Codex.",
        ),
      ).toBeInTheDocument();
    });

    // An older server answers 200 with no version. Saying so beats printing the
    // word "undefined" over a removal that already happened.
    it("says the version is unknown when the server reported none", async () => {
      stubFetch(null, () =>
        jsonResponse({ removed: { type: "skill", name: "tdd" } }, 200),
      );
      renderRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      expect(
        await screen.findByText(
          `Removed tdd (version unknown) from ${REPO_NAME}.`,
        ),
      ).toBeInTheDocument();
    });

    it("says nothing when the removal failed", async () => {
      vi.stubGlobal("fetch", async () =>
        jsonResponse({ error: "remove-failed" }, 502),
      );
      renderRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      await screen.findByRole("alert");
      expect(screen.queryByText(/^Removed tdd/)).not.toBeInTheDocument();
    });

    // The toast lives outside the table, so the sentence survives the row and
    // the card that held it.
    it("stays on screen after the last skill on the card is gone", async () => {
      stubFetch(null);
      const { withoutTdd } = renderRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
      await screen.findByText(`Removed tdd v0.5.0 from ${REPO_NAME}.`);
      withoutTdd();

      expect(
        screen.getByText(`Removed tdd v0.5.0 from ${REPO_NAME}.`),
      ).toBeInTheDocument();
    });
  });
});
