import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONFIRM,
  checkFor,
  jsonResponse,
  openRemoveDialog,
  RECEIPT,
  renderRow,
  screen,
  userEvent,
} from "./remove-skill-row-test-helpers";

// Split from one 32-test file (#723) — see remove-skill-row.test.tsx.

afterEach(() => {
  vi.unstubAllGlobals();
});

// Through the mounted row and a real QueryClient, so the whole reopen — the
// row's own query observer included — is what holds the confirm, not the
// mapper read in isolation (#381).
describe("removing a deployed skill from a row", () => {
  describe("when the confirmation is reopened for the same row", () => {
    it("holds the confirm at checking until the fresh check answers", async () => {
      let releaseSecondCheck = () => {};
      let checks = 0;
      const fetchMock = vi.fn(async (path: string, init: RequestInit) => {
        if (path !== "/api/deploy/remove/preflight") {
          throw new Error(`unexpected request: ${path}`);
        }
        checks += 1;
        if (checks === 2) {
          await new Promise<void>((resolve) => {
            releaseSecondCheck = resolve;
          });
        }
        return jsonResponse(
          {
            // A different answer each time, so a stale one on screen shows up
            // as the first open's verdict rather than as no verdict at all.
            check: checkFor(
              checks === 1 ? null : "cannot-verify-local-edits",
              init,
            ),
            reclaim: null,
            receipt: RECEIPT,
          },
          200,
        );
      });
      vi.stubGlobal("fetch", fetchMock);
      renderRow();

      await openRemoveDialog();
      await waitFor(() => {
        expect(screen.getByRole("button", { name: CONFIRM })).toBeEnabled();
      });
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

      await openRemoveDialog();
      expect(
        screen.getByRole("status", { name: "Local edits check" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: CONFIRM })).toBeDisabled();

      releaseSecondCheck();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: CONFIRM })).toBeEnabled();
      });
      // The second check's answer, not the clean one the first open reported.
      expect(await screen.findByRole("dialog")).toHaveTextContent(
        /may lose work/i,
      );
    });
  });
});
