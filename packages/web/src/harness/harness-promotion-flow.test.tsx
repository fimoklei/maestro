import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithQuery } from "../test-utils";
import {
  installHarnessHooks,
  ON_DISK,
  openPane,
  openRowMenu,
  promoteRow,
  renderHarness,
  row,
  stageRows,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";
import { HarnessView } from "./harness-view";
import { pullRequest } from "./stage-row-fixture";

installHarnessHooks();

describe("Harness promotion", () => {
  // What the read says once lint-rules has been pushed: a prepared branch with
  // no request is Pull request missing, never an open review (user story 11).
  const REVIEWED: HarnessState = withStages(ON_DISK, {
    proposal: [row("pending-proposal", "code-review", "not-yet-proposed")],
    review: [row("pending-review", "lint-rules", "pull-request-missing")],
  });

  const PUSHED = {
    branch: "maestro/lint-rules",
    pullRequestUrl:
      "https://github.com/fimoklei/agent-harness/compare/main...maestro/lint-rules?expand=1",
  };

  it("promotes the skill whose row it is, and nothing else", async () => {
    const promotions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: ON_DISK },
      promote: { body: PUSHED },
      promotions,
    });
    renderHarness();

    await promoteRow("lint-rules");

    await waitFor(() => expect(promotions).toEqual([{ name: "lint-rules" }]));
  });

  it("warns that a teammate already changed the skill, and still lets it be promoted", async () => {
    // #579: the signal is content, never a block — review on GitHub remains
    // the merge safety net, so Promote stays pressable beside the warning.
    const promotions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          proposal: [
            row("pending-proposal", "lint-rules", "not-yet-proposed", {
              concurrentChange: true,
            }),
            row("pending-proposal", "code-review", "not-yet-proposed"),
          ],
        }),
      },
      promote: { body: PUSHED },
      promotions,
    });
    renderHarness();

    // Stated in the row's own pane, and in no other row's.
    const warned = await openPane("lint-rules");
    expect(
      within(warned).getByText(/Pull it into the Harness clone/i),
    ).toBeInTheDocument();
    const untouched = await openPane("code-review");
    expect(
      within(untouched).queryByText(/Pull it into the Harness clone/i),
    ).not.toBeInTheDocument();

    await promoteRow("lint-rules");

    await waitFor(() => expect(promotions).toEqual([{ name: "lint-rules" }]));
  });

  it("moves the promoted row to Pending review, with no request yet claimed", async () => {
    // A pushed branch is not an open review: it reads as Pull request missing
    // until GitHub says a request exists (user story 11).
    stubHarnessServer({
      read: { body: ON_DISK, afterPromote: REVIEWED },
      promote: { body: PUSHED },
    });
    renderHarness();

    await promoteRow("lint-rules");

    await waitFor(async () =>
      expect(
        (await stageRows("Pending review")).map((each) => each.textContent),
      ).toEqual([expect.stringMatching(/lint-rules.*Pull request missing/)]),
    );
  });

  it("lands the keyboard on the promoted row, not on a later stage's twin", async () => {
    // lint-rules holds a row in every stage. The press made a Pending review
    // row, so that is where the keyboard goes — Pending release only mounts
    // last (#865).
    const request = pullRequest(45);
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          proposal: [row("pending-proposal", "lint-rules", "not-yet-proposed")],
          review: [
            row("pending-review", "lint-rules", "waiting-for-review", {
              requests: [request],
            }),
          ],
          release: [
            row("pending-release", "lint-rules", "changed", {
              requests: [request],
            }),
          ],
        }),
        afterPromote: withStages(ON_DISK, {
          review: [
            row("pending-review", "lint-rules", "waiting-for-review", {
              requests: [request],
            }),
          ],
          release: [
            row("pending-release", "lint-rules", "changed", {
              requests: [request],
            }),
          ],
        }),
      },
      promote: { body: PUSHED },
    });
    renderHarness();

    await promoteRow("lint-rules");

    // The pressed row moved away with its menu; the keyboard follows it to
    // the Pending review row's pane, never the Pending release twin's.
    const pane = await screen.findByRole("complementary", {
      name: "lint-rules detail",
    });
    await waitFor(() =>
      expect(
        within(pane).getByRole("heading", { level: 2, name: "lint-rules" }),
      ).toHaveFocus(),
    );
    expect(within(pane).getByText("Waiting for review")).toBeInTheDocument();
  });

  it("re-reads the harness after a promotion, rather than moving the row itself", async () => {
    const calls = stubHarnessServer({
      read: { body: ON_DISK, afterPromote: REVIEWED },
      promote: { body: PUSHED },
    });
    renderHarness();
    await screen.findByText("lint-rules");
    const before = calls.filter((call) => call === "GET /api/harness").length;

    await promoteRow("lint-rules");

    await waitFor(() =>
      expect(
        calls.filter((call) => call === "GET /api/harness").length,
      ).toBeGreaterThan(before),
    );
  });

  it("states a refused promotion on the row, with the press still available", async () => {
    stubHarnessServer({
      read: { body: ON_DISK },
      promote: {
        body: {
          error: "promote-failed",
        },
        status: 502,
      },
    });
    renderHarness();

    await promoteRow("lint-rules");

    expect(
      await screen.findByText(/The Harness is as it was/i),
    ).toBeInTheDocument();
    const menu = await openRowMenu("lint-rules");
    expect(
      within(menu).getByRole("menuitem", { name: /^propose change$/i }),
    ).not.toHaveAttribute("data-disabled");
  });

  it("keeps Promote out of reach until a fetch has answered", async () => {
    stubHarnessServer({
      read: {
        body: {
          ...ON_DISK,
          freshness: { outcome: "offline", lastFetchedAt: null },
        },
      },
    });
    renderHarness();

    const menu = await openRowMenu("lint-rules");
    await waitFor(() =>
      expect(
        within(menu).getByRole("menuitem", { name: /^propose change$/i }),
      ).toHaveAttribute("data-disabled"),
    );
  });

  it("offers no Propose change on a row that is already pushed", async () => {
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          review: [
            row("pending-review", "lint-rules", "pull-request-missing"),
            row("pending-review", "old-skill", "pull-request-missing", {
              deletion: true,
            }),
          ],
        }),
      },
    });
    renderHarness();

    // A pushed row's way on is Create pull request, never a second push:
    // Propose change belongs to the independent Pending proposal row (#844).
    await screen.findByText("lint-rules");
    await userEvent.click(
      screen.getByRole("button", {
        name: "Actions for lint-rules in Pending review",
      }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Create pull request"]);
  });

  it("keeps the pull-request link through a refresh and a remount", async () => {
    // The link is read from the state, never kept in the component: rebuilding
    // the client and remounting the view must not lose it (user story 12).
    const OPEN_REQUEST = withStages(ON_DISK, {
      review: [
        row("pending-review", "lint-rules", "waiting-for-review", {
          requests: [pullRequest(45)],
        }),
      ],
    });
    stubHarnessServer({ read: { body: OPEN_REQUEST } });
    const first = renderWithQuery(<HarnessView />);
    const before = await openRowMenu("lint-rules", "Pending review");
    expect(
      within(before).getByRole("menuitem", { name: /view pull request/i }),
    ).toHaveAttribute(
      "href",
      "https://github.com/fimoklei/agent-harness/pull/45",
    );

    first.unmount();
    renderWithQuery(<HarnessView />);

    const after = await openRowMenu("lint-rules", "Pending review");
    expect(
      within(after).getByRole("menuitem", { name: /view pull request/i }),
    ).toHaveAttribute(
      "href",
      "https://github.com/fimoklei/agent-harness/pull/45",
    );
  });

  it("lists one link per request when more than one matches", async () => {
    stubHarnessServer({
      read: {
        body: withStages(ON_DISK, {
          review: [
            row("pending-review", "lint-rules", "multiple-pull-requests", {
              requests: [pullRequest(41), pullRequest(44)],
            }),
          ],
        }),
      },
    });
    renderHarness();

    const pane = await openPane("lint-rules", "Pending review");
    expect(
      within(pane).getByText(
        "Pull requests #41 and #44 both match this branch. Open the extra pull requests on GitHub and close them.",
      ),
    ).toBeInTheDocument();
    const menu = await openRowMenu("lint-rules", "Pending review");
    expect(
      within(menu).getByRole("menuitem", { name: "View pull request #41" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "View pull request #44" }),
    ).toBeInTheDocument();
  });
});
