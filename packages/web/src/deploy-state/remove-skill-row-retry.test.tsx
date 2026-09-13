import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONFIRM,
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

// Split from one 32-test file (#723) — see remove-skill-row.test.tsx.

afterEach(() => {
  vi.unstubAllGlobals();
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
    // The trigger the modal would normally restore focus to disappears with the
    // row, so the card's header takes it instead.
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

  // The retry is the same removal, not a fresh one the user has to describe
  // again: same skill, same target, straight from the panel that reported the
  // failure (#415).
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
    // Both requests, asserted as one list: what makes this a retry rather than
    // a second removal is that the two are the same request.
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

  // The mutation drops its error the moment the retry starts, which would take
  // the failure block, the red outline and `close` with it — the panel would
  // leave its failed state during the very attempt that state offered (#415).
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
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /The removal ran but proved nothing/,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });

  // apm can remove a skill and still fail to prove it, which leaves the entry
  // gone from the lockfile. The retry then finds nothing to remove — the first
  // attempt did land, so reporting a second failure would be the cockpit
  // calling a finished removal broken (#415).
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
    // No trace line: the server never named the version this removal ran
    // against, and the screen's own guess is not its answer (#383). The row
    // leaving the refetched card is the evidence.
    expect(screen.queryByText(/Removed tdd/)).toBeNull();
  });

  // The same answer on a first attempt means the skill was never deployed here.
  // Nothing landed, so there is nothing to settle.
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
