import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { sentence } from "../test-utils";
import {
  harnessRegion,
  installHarnessHooks,
  ON_DISK,
  RELEASED,
  renderHarness,
  row,
  stageHeader,
  stageRows,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";
import { pullRequest } from "./stage-row-fixture";

installHarnessHooks();

const FETCHED: HarnessState = {
  ...RELEASED,
  releasedVersion: "v1.4.0",
  freshness: { outcome: "fetched", lastFetchedAt: "2026-08-03T11:56:00.000Z" },
};

const proposalRow = (skill: string, number: number | null) =>
  row("pending-proposal", skill, "not-yet-proposed", {
    comparison:
      number === null
        ? { kind: "default-branch" }
        : { kind: "proposal", number },
  });

// The meta slot of one stage's header, once the header is painted.
const metaOf = async (stage: string, text: string) =>
  within(await stageHeader(stage)).findByText(sentence(text));

// The stage header's meta slot carries at most one reading, never two (#838),
// and never a routine read age (#1218).
describe("Harness stage headers", () => {
  it("names the sole proposal every row was compared with", async () => {
    stubHarnessServer({
      read: {
        body: withStages(FETCHED, { proposal: [proposalRow("tdd", 412)] }),
      },
    });
    renderHarness();

    expect(
      await metaOf("Pending proposal", "Compared with pull request #412"),
    ).toBeInTheDocument();
  });

  it("names the default branch, as a machine value, when every row was compared with it", async () => {
    stubHarnessServer({
      read: {
        body: withStages(FETCHED, { proposal: [proposalRow("tdd", null)] }),
      },
    });
    renderHarness();

    const meta = await metaOf("Pending proposal", "Compared with main");
    expect(within(meta).getByText("main")).toHaveClass("font-mono");
  });

  it("asserts no single comparison when the rows disagree", async () => {
    stubHarnessServer({
      read: {
        body: withStages(FETCHED, {
          proposal: [proposalRow("tdd", 412), proposalRow("caveman", null)],
        }),
      },
    });
    renderHarness();

    const meta = await metaOf(
      "Pending proposal",
      "Compared with each change's proposal or main",
    );
    expect(within(meta).getByText("main")).toHaveClass("font-mono");
  });

  it("leaves a routine review read without a meta line", async () => {
    stubHarnessServer({
      read: {
        body: withStages(FETCHED, {
          review: [
            row("pending-review", "tdd", "waiting-for-review", {
              requests: [pullRequest(45)],
            }),
          ],
        }),
      },
    });
    renderHarness();

    expect(await stageHeader("Pending review")).toHaveTextContent(
      /^Pending review 1$/,
    );
  });

  it("replaces the whole slot when a review read failed", async () => {
    stubHarnessServer({
      read: {
        body: {
          ...FETCHED,
          stages: { ...FETCHED.stages, review: { outcome: "unknown" } },
        },
      },
    });
    renderHarness();

    expect(
      within(await stageHeader("Pending review")).getByText(
        "Review status unknown",
      ),
    ).toBeInTheDocument();
  });

  it("names the release Pending release was compared with, as a machine value", async () => {
    stubHarnessServer({
      read: {
        body: withStages(FETCHED, {
          release: [row("pending-release", "tdd", "not-yet-released")],
        }),
      },
    });
    renderHarness();

    const meta = await metaOf("Pending release", "Compared with v1.4.0");
    expect(within(meta).getByText("v1.4.0")).toHaveClass("font-mono");
  });

  it("states a Harness with no release in the release words of every screen", async () => {
    stubHarnessServer({
      read: {
        body: withStages(
          { ...FETCHED, releasedVersion: null },
          { release: [row("pending-release", "tdd", "not-yet-released")] },
        ),
      },
    });
    renderHarness();

    expect(
      await metaOf("Pending release", "Not released yet"),
    ).toBeInTheDocument();
  });
});

// A read moves rows between stages; the move is announced in counts, never
// statuses: the row itself states why it is where it is (#868).
describe("Harness move announcement", () => {
  const announceAfterReread = async (after: HarnessState) => {
    const before = withStages(ON_DISK, {
      proposal: [
        row("pending-proposal", "lint-rules", "not-yet-proposed"),
        row("pending-proposal", "code-review", "not-yet-proposed"),
        row("pending-proposal", "tdd", "not-yet-proposed"),
      ],
    });
    stubHarnessServer({
      read: { body: before },
      refresh: { body: before, retry: { body: after } },
    });
    renderHarness();
    await waitFor(async () =>
      expect(await stageRows("Pending proposal")).toHaveLength(3),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Harness" }),
    );
  };

  it("counts more than one change in the plural, and never counts an unread stage as empty", async () => {
    await announceAfterReread({
      ...ON_DISK,
      stages: {
        proposal: {
          outcome: "read",
          bound: null,
          rows: [
            row("pending-proposal", "code-review", "not-yet-proposed"),
            row("pending-proposal", "tdd", "not-yet-proposed"),
          ],
        },
        review: { outcome: "unavailable" },
        release: { outcome: "read", rows: [], bound: null },
      },
    });

    await waitFor(() =>
      expect(harnessRegion()).toHaveTextContent(
        "Pending proposal has 2 changes. Pending review was not read. Pending release has no changes. Read 4 min ago.",
      ),
    );
  });

  it("says plainly when no read has ever succeeded", async () => {
    await announceAfterReread({
      ...withStages(ON_DISK, {
        proposal: [row("pending-proposal", "tdd", "not-yet-proposed")],
        review: [row("pending-review", "lint-rules", "pull-request-missing")],
      }),
      freshness: { outcome: null, lastFetchedAt: null },
    });

    await waitFor(() =>
      expect(harnessRegion()).toHaveTextContent(
        /has 1 change\..*Not read yet\.$/,
      ),
    );
  });
});
