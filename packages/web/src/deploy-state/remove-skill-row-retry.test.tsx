import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONFIRM,
  clearToasts,
  jsonResponse,
  openRemoveDialog,
  REPO,
  RETRY,
  removeCalls,
  renderRow,
  screen,
  stubFetch,
  userEvent,
} from "./remove-skill-row-test-helpers";

// Split from one file (#723); see remove-skill-row.test.tsx.

afterEach(() => {
  vi.unstubAllGlobals();
  clearToasts();
});

describe("removing a deployed skill from a row", () => {
  it("closes and hands focus back to the card once the removal lands", async () => {
    vi.stubGlobal("fetch", async () =>
      jsonResponse({ removed: { type: "skill", name: "tdd" } }, 200),
    );
    const { onRemoved } = renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(onRemoved).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the dialog open on failure, with the removal's own reason", async () => {
    vi.stubGlobal("fetch", async () =>
      jsonResponse({ error: "remove-failed" }, 502),
    );
    const { onRemoved } = renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /The removal ran but proved nothing/,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it("re-fires the same removal against the same target when retried", async () => {
    let attempts = 0;
    const fetchMock = stubFetch(null, () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ error: "remove-failed" }, 502)
        : jsonResponse(
            { removed: { type: "skill", name: "tdd", version: "v0.5.0" } },
            200,
          );
    });
    const { onRemoved } = renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
    await userEvent.click(await screen.findByRole("button", { name: RETRY }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const sameRemoval = expect.objectContaining({
      name: "tdd",
      target: { kind: "repo", repoPath: REPO },
    });
    expect(
      removeCalls(fetchMock).map(([, init]) =>
        JSON.parse(String((init as RequestInit).body)),
      ),
    ).toEqual([sameRemoval, sameRemoval]);
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  it("keeps stating the failure while the retry is in flight", async () => {
    let attempts = 0;
    stubFetch(null, () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ error: "remove-failed" }, 502)
        : // A retry that never answers, so the in-flight panel can be read.
          new Promise<Response>(() => undefined);
    });
    renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
    await userEvent.click(await screen.findByRole("button", { name: RETRY }));

    expect(
      await screen.findByRole("button", { name: /removing/i }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      /The removal ran but proved nothing/,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });

  it("settles the removal when the retry finds nothing left", async () => {
    let attempts = 0;
    stubFetch(null, () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ error: "remove-failed" }, 502)
        : jsonResponse({ error: "not-deployed" }, 404);
    });
    const { onRemoved } = renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));
    await userEvent.click(await screen.findByRole("button", { name: RETRY }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(onRemoved).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Removed tdd/)).toBeNull();
  });

  it("keeps a first attempt open when the skill is not deployed", async () => {
    stubFetch(null, () => jsonResponse({ error: "not-deployed" }, 404));
    const { onRemoved } = renderRow();

    await openRemoveDialog();
    await userEvent.click(screen.getByRole("button", { name: CONFIRM }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Nothing was removed/,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onRemoved).not.toHaveBeenCalled();
  });
});
