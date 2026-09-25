import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONFIRM,
  clearToasts,
  jsonResponse,
  openRemoveDialog,
  preflightCalls,
  RECEIPT,
  removeCalls,
  renderRow,
  screen,
  stubFetch,
  userEvent,
  within,
} from "./remove-skill-row-test-helpers";

// Split from one file (#723); see remove-skill-row.test.tsx.

afterEach(() => {
  vi.unstubAllGlobals();
  clearToasts();
});

describe("removing a deployed skill from a row", () => {
  describe("on a global row", () => {
    const renderGlobalRow = () =>
      renderRow({ target: { kind: "global", tools: ["claude", "codex"] } });

    it("offers Remove skill just as a repo row does", async () => {
      stubFetch(null);
      renderGlobalRow();

      await openRemoveDialog();

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("names every detected tool in the confirmation", async () => {
      stubFetch(null);
      renderGlobalRow();

      const dialog = await openRemoveDialog();

      expect(dialog).toHaveTextContent("Claude Code");
      expect(dialog).toHaveTextContent("Codex");
    });

    it("asks the server for a global removal, carrying no path", async () => {
      const fetchMock = stubFetch(null);
      renderGlobalRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      await waitFor(() => {
        expect(removeCalls(fetchMock)).toHaveLength(1);
      });
      const [, init] = removeCalls(fetchMock)[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        type: "skill",
        name: "tdd",
        target: { kind: "global" },
        confirmedRemovalReceipt: RECEIPT,
      });
    });

    it("checks what the global removal would cost before it runs", async () => {
      const fetchMock = stubFetch("cannot-verify-local-edits");
      renderGlobalRow();

      const dialog = await openRemoveDialog();

      const region = await within(dialog).findByRole("status", {
        name: /removal targets/i,
      });
      expect(
        within(region).getAllByText("Nothing recorded — may lose work"),
      ).toHaveLength(2);
      const [, init] = preflightCalls(fetchMock)[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        type: "skill",
        name: "tdd",
        target: { kind: "global" },
      });
    });

    it("confirms a restated cost with the leftovers that came with it", async () => {
      const RESTATED = "c".repeat(64);
      const RESTATED_TOKEN = "d".repeat(64);
      let attempts = 0;
      const fetchMock = stubFetch(null, () => {
        attempts += 1;
        return attempts === 1
          ? jsonResponse(
              {
                error: "cost-not-acknowledged",
                check: {
                  scope: "global",
                  tools: [
                    { tool: "codex", warning: "cannot-verify-local-edits" },
                    { tool: "claude", warning: null },
                  ],
                },
                receipt: RESTATED,
                reclaim: {
                  previews: [
                    { tool: "claude", path: "/Users/me/.claude/skills/tdd" },
                  ],
                  token: RESTATED_TOKEN,
                },
              },
              409,
            )
          : jsonResponse(
              { removed: { type: "skill", name: "tdd", version: "v0.5.0" } },
              200,
            );
      }, [{ tool: "claude", path: "/Users/me/.claude/skills/tdd" }]);
      renderGlobalRow();

      await openRemoveDialog();
      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
      await waitFor(() => {
        expect(removeCalls(fetchMock)).toHaveLength(1);
      });
      await userEvent.click(
        await screen.findByRole("button", { name: CONFIRM }),
      );

      await waitFor(() => {
        expect(removeCalls(fetchMock)).toHaveLength(2);
      });
      const [, init] = removeCalls(fetchMock)[1] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toMatchObject({
        confirmedRemovalReceipt: RESTATED,
        confirmedReclaimToken: RESTATED_TOKEN,
      });
    });

    it("names the leftover copy and confirms with preflight's own token", async () => {
      const fetchMock = stubFetch(null, undefined, [
        { tool: "claude", path: "/Users/me/.claude/skills/tdd" },
      ]);
      renderGlobalRow();

      const dialog = await openRemoveDialog();
      expect(dialog).toHaveTextContent("/Users/me/.claude/skills/tdd");

      await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

      await waitFor(() => {
        expect(removeCalls(fetchMock)).toHaveLength(1);
      });
      const [, init] = removeCalls(fetchMock)[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        type: "skill",
        name: "tdd",
        target: { kind: "global" },
        confirmedReclaimToken: "a".repeat(64),
        confirmedRemovalReceipt: RECEIPT,
      });
    });
  });
});
