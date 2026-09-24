import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  harnessGrid,
  installHarnessHooks,
  RELEASED,
  renderHarness,
  row,
  stageHeader,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";

installHarnessHooks();

// A read that failed leaves the cockpit readable and honest: never silently
// current, never blank (#848).
describe("Harness freshness and failed reads", () => {
  const STALE: HarnessState = {
    ...RELEASED,
    freshness: {
      outcome: "fetch-failed",
      lastFetchedAt: "2026-08-03T11:56:00.000Z",
    },
    stages: {
      proposal: {
        outcome: "read",
        bound: null,
        rows: [
          row("pending-proposal", "tdd", "not-yet-proposed", {
            requests: [
              {
                number: 45,
                url: "https://github.com/fimoklei/agent-harness/pull/45",
              },
            ],
          }),
        ],
      },
      review: { outcome: "unknown" },
      release: { outcome: "read", rows: [], bound: null },
    },
  };

  it("offers Re-read Harness as the one way back, and never Refresh or Retry check", async () => {
    const calls = stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    const retry = await screen.findByRole("button", {
      name: "Re-read Harness",
    });
    await waitFor(() => expect(retry).not.toHaveAttribute("aria-busy"));
    await userEvent.click(retry);

    await waitFor(() =>
      expect(
        calls.filter((call) => call === "POST /api/harness/refresh"),
      ).toHaveLength(2),
    );
    expect(
      screen.queryByRole("button", { name: /refresh|retry check/i }),
    ).not.toBeInTheDocument();
  });

  it("fills only Create a release, so the screen states one next step", async () => {
    stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    await screen.findByRole("button", { name: /^create a release$/i });
    // The filled action is neutral under the new system (ADR-0033 §2); the
    // claim is that there is exactly one of them.
    const filled = [...document.querySelectorAll("button.bg-gray-12")];
    expect(filled.map((button) => button.textContent)).toEqual([
      "Create a release",
    ]);
  });

  it("states a clone the check could not catch up", async () => {
    stubHarnessServer({
      read: { body: RELEASED },
      refresh: { body: { ...RELEASED, cloneSync: "local-changes" } },
    });
    renderHarness();

    expect(
      await screen.findAllByText("Harness clone not updated"),
    ).toHaveLength(1);
    expect(
      screen.getByText(
        "Your local changes are as they were. Commit or undo them in your Git tool, then select Re-read Harness.",
      ),
    ).toBeInTheDocument();
  });

  it("waits for the open-time check before stating where the clone stands", async () => {
    // The plain read paints the clone before the check catches it up, so its
    // reading is the one the check is about to replace (#978).
    let release = () => {};
    const heldUntil = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubHarnessServer({
      read: { body: { ...RELEASED, cloneSync: "local-changes" } },
      refresh: { body: RELEASED, heldUntil },
    });
    renderHarness();

    await screen.findByRole("button", { name: /^create a release$/i });
    expect(
      screen.queryByText("Harness clone not updated"),
    ).not.toBeInTheDocument();

    release();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Re-read Harness" }),
      ).not.toHaveAttribute("aria-busy"),
    );
    expect(
      screen.queryByText("Harness clone not updated"),
    ).not.toBeInTheDocument();
  });

  it("states one Status out of date notice over a previous read", async () => {
    stubHarnessServer({ read: { body: STALE } });
    renderHarness();

    expect(await screen.findAllByText("Status out of date")).toHaveLength(1);
    expect(
      screen.getByText(
        "GitHub gave no answer, so these rows are from the last read.",
      ),
    ).toBeInTheDocument();
    // The rows stay: what was read last still reads, dated as such.
    expect(screen.getByText("tdd")).toBeInTheDocument();
  });

  it("closes Create a release and every row-menu press while the read is stale", async () => {
    stubHarnessServer({ read: { body: STALE } });
    renderHarness();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^create a release$/i }),
      ).toBeDisabled(),
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Actions for tdd in Pending proposal",
      }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: /^propose change$/i }),
    ).toHaveAttribute("aria-disabled", "true");
    // The link is not a mutation: it reaches GitHub, which is exactly what a
    // stale picture leaves the author to do.
    const link = within(menu).getByRole("menuitem", {
      name: /^view pull request$/i,
    });
    expect(link).not.toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/fimoklei/agent-harness/pull/45",
    );
  });

  // Pending proposal is the one stage an empty read still draws, because it
  // hosts Import skill. Beside work in another stage the journey is not empty,
  // so it names the two ways to put a change here.
  it("sends the author to their clone or to Import skill when only Pending proposal is empty", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          review: [row("pending-review", "tdd", "waiting-for-review")],
        }),
      },
    });
    renderHarness();

    expect(
      await screen.findByText("No changes to propose yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Changes you make in your clone appear here. Select Import skill… to bring one in.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("No changes yet")).not.toBeInTheDocument();
  });

  it("draws no card, no zero and no rows for a stage nobody could read", async () => {
    stubHarnessServer({
      read: {
        body: {
          ...RELEASED,
          stages: {
            proposal: { outcome: "unknown" },
            review: { outcome: "unavailable" },
            release: { outcome: "read", rows: [], bound: null },
          },
        },
      },
    });
    renderHarness();

    expect(
      within(await stageHeader("Pending proposal")).getByText("Status unknown"),
    ).toBeInTheDocument();
    expect(
      within(await stageHeader("Pending review")).getByText(
        "Review status unavailable",
      ),
    ).toBeInTheDocument();
    // The cause and the way through, without first attempting a mutation.
    expect(
      screen.getByText("GitHub gave no answer Maestro can act on."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Sign in with gh auth login, then select Re-read Harness.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Maestro reads pull requests through your own gh sign-in.",
      ),
    ).toBeInTheDocument();
    // A confirmed-empty stage's words must never stand in for an unread one.
    expect(screen.queryByText("No changes yet")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No changes to propose yet"),
    ).not.toBeInTheDocument();
    // Each unread stage keeps its header and one line; neither holds a row.
    expect(
      within(await harnessGrid())
        .getAllByRole("row")
        .filter((each) => each.id !== ""),
    ).toHaveLength(0);
    // Import touches the working tree only, so it survives an unread stage.
    expect(
      screen.getByRole("button", { name: /^import skill…$/i }),
    ).toBeInTheDocument();
  });

  // The unread stage's line names the band's Re-read Harness; the screen has
  // one re-read control, never a second one per stage (#994).
  it("reads GitHub again from the Re-read Harness its unread stage names", async () => {
    const calls = stubHarnessServer({
      read: {
        body: {
          ...RELEASED,
          stages: {
            proposal: { outcome: "read", rows: [], bound: null },
            review: { outcome: "unavailable" },
            release: { outcome: "read", rows: [], bound: null },
          },
        },
      },
    });
    renderHarness();

    expect(
      await screen.findByText(
        "Sign in with gh auth login, then select Re-read Harness.",
      ),
    ).toBeInTheDocument();
    const reread = screen.getAllByRole("button", { name: "Re-read Harness" });
    expect(reread).toHaveLength(1);
    await waitFor(() => expect(reread[0]).not.toHaveAttribute("aria-busy"));
    await userEvent.click(reread[0] as HTMLElement);

    await waitFor(() =>
      expect(
        calls.filter((call) => call === "POST /api/harness/refresh"),
      ).toHaveLength(2),
    );
  });

  it("leaves release facts readable when the review read failed, and the reverse", async () => {
    stubHarnessServer({
      read: {
        body: {
          ...RELEASED,
          releaseState: "pending-release",
          stages: {
            proposal: { outcome: "read", rows: [], bound: null },
            review: { outcome: "unavailable" },
            release: {
              outcome: "read",
              bound: null,
              rows: [row("pending-release", "research", "added")],
            },
          },
        },
      },
    });
    renderHarness();

    expect(
      await screen.findByText("Review status unavailable"),
    ).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /research/ })).toHaveTextContent(
      "Added",
    );
  });

  it("names the bound a review read filled, beside its age", async () => {
    stubHarnessServer({
      read: {
        body: {
          ...RELEASED,
          freshness: {
            outcome: "fetched",
            lastFetchedAt: "2026-08-03T11:56:00.000Z",
          },
          stages: {
            proposal: { outcome: "read", rows: [], bound: null },
            review: {
              outcome: "read",
              bound: 50,
              rows: [row("pending-review", "tdd", "waiting-for-review")],
            },
            release: { outcome: "read", rows: [], bound: null },
          },
        },
      },
    });
    renderHarness();

    expect(
      await screen.findByText(
        "Read the 50 most recent pull requests, 4 min ago",
      ),
    ).toBeInTheDocument();
  });
});
