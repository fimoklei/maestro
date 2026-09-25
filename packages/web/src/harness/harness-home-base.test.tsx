import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  installHarnessHooks,
  openPane,
  RELEASED,
  renderHarness,
  row,
  STAGE_TITLES,
  stageHeader,
  stageHeaders,
  stageRows,
  stubHarnessServer,
  withStages,
} from "./harness-flow-fixture";
import { pullRequest } from "./stage-row-fixture";

installHarnessHooks();

// Band 2: Origin, Released and Branch, then the freshness line (#994).
const band2 = async () =>
  (await screen.findByRole("button", { name: "Re-read Harness" })).closest(
    '[data-band="2"]',
  ) as HTMLElement;

describe("Harness home base", () => {
  it("names the repository it is about", async () => {
    stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    expect(
      // The view's own <h1>, so heading navigation has a starting point
      // (#868). Inventory carries one too.
      await screen.findByRole("heading", { level: 1, name: /harness/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("github.com/fimoklei/agent-harness"),
    ).toBeInTheDocument();
  });

  it("puts every stage in one table, a group per stage in journey order", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          proposal: [row("pending-proposal", "tdd", "not-yet-proposed")],
          review: [row("pending-review", "lint-rules", "waiting-for-review")],
          release: [row("pending-release", "research", "added")],
        }),
      },
    });
    renderHarness();

    expect(
      (await stageHeaders()).map((header) =>
        STAGE_TITLES.find((title) => header.startsWith(title)),
      ),
    ).toEqual(STAGE_TITLES);
    // One grid, one Tab stop: the stages are its groups, not three tables.
    expect(screen.getAllByRole("grid")).toHaveLength(1);
  });

  it("counts what each read stage holds, in its heading", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          proposal: [row("pending-proposal", "tdd", "not-yet-proposed")],
          review: [
            row("pending-review", "lint-rules", "waiting-for-review"),
            row("pending-review", "research", "waiting-for-review"),
          ],
          release: [
            row("pending-release", "tdd", "changed"),
            row("pending-release", "lint-rules", "added"),
            row("pending-release", "research", "added"),
          ],
        }),
      },
    });
    renderHarness();

    // Three honest numbers, never a sum: one skill can hold a row in all
    // three stages (ADR-0021 · 10).
    expect(await stageHeader("Pending proposal")).toHaveTextContent(
      /^Pending proposal 1(\D|$)/,
    );
    expect(await stageHeader("Pending review")).toHaveTextContent(
      /^Pending review 2(\D|$)/,
    );
    expect(await stageHeader("Pending release")).toHaveTextContent(
      /^Pending release 3(\D|$)/,
    );
    expect(screen.queryByText("6")).not.toBeInTheDocument();
  });

  it("gives a stage read empty no number", async () => {
    // Pending proposal is the one stage a confirmed empty read still draws, so
    // it is where a zero could be mistaken for an unread stage (#827).
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          review: [row("pending-review", "lint-rules", "waiting-for-review")],
        }),
      },
    });
    renderHarness();

    const header = await stageHeader("Pending proposal");
    expect(header.textContent).not.toMatch(/^Pending proposal \d/);
    expect(
      screen.getByText("No changes to propose yet", { exact: false }),
    ).toBeInTheDocument();
  });

  it("gives a stage nobody read no number and no card", async () => {
    stubHarnessServer({
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

    // The count gives way to an Unknown badge with the reading (#994).
    const header = await stageHeader("Pending review");
    expect(header.textContent).not.toMatch(/^Pending review \d/);
    expect(within(header).getByText("Review status unavailable")).toHaveClass(
      "bg-gray-3",
    );
  });

  it("leaves the release summary to the tables that already say it", async () => {
    stubHarnessServer({
      read: {
        body: { ...RELEASED, releaseState: "pending-release" },
      },
    });
    renderHarness();

    await screen.findByRole("heading", { level: 1, name: /harness/i });
    expect(
      screen.queryByText("Merged changes are waiting for release."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Everything merged is released."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("No release yet.")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Not read yet, so what is waiting is unknown."),
    ).not.toBeInTheDocument();
  });

  // A press moves a row from one stage to another and the meta line re-dates
  // itself, both without moving focus. Nothing said so out loud before (#868).
  it("announces what each stage holds, politely", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          proposal: [row("pending-proposal", "tdd", "not-yet-proposed")],
        }),
      },
    });
    renderHarness();

    const live = await screen.findByRole("status", { name: "Harness stages" });
    await waitFor(() =>
      expect(live).toHaveTextContent(
        "Pending proposal has 1 change. Pending review has no changes. Pending release has no changes. Not read yet.",
      ),
    );
    expect(live).toHaveAttribute("aria-live", "polite");
  });

  it("shows the released version and the branch a release would tag", async () => {
    stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    expect(await screen.findByText("v0.5.0")).toBeInTheDocument();
    expect(await screen.findByText("main")).toBeInTheDocument();
  });

  // Band 2's own facts. A stage meta slot dates the same read in the same
  // words, so the text alone does not pick out band 2 (#850).
  const stripFacts = band2;

  it("fetches when it opens, so the state is the team's and not yesterday's", async () => {
    const calls = stubHarnessServer({
      read: { body: RELEASED },
      refresh: {
        body: {
          ...RELEASED,
          freshness: {
            outcome: "fetched",
            lastFetchedAt: "2026-08-03T11:56:00.000Z",
          },
        },
      },
    });
    renderHarness();

    await waitFor(async () =>
      expect(
        within(await stripFacts()).getByText("Read 4 min ago"),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        calls.filter((call) => call === "POST /api/harness/refresh"),
      ).toHaveLength(1),
    );
  });

  it("fetches again on Re-read Harness", async () => {
    const calls = stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    // The open-time refresh holds the button busy while it runs; clicking
    // into that window would land on nothing.
    const button = await screen.findByRole("button", {
      name: "Re-read Harness",
    });
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
    await userEvent.click(button);

    await waitFor(() =>
      expect(
        calls.filter((call) => call === "POST /api/harness/refresh"),
      ).toHaveLength(2),
    );
  });

  // A git fetch on every focus locked the row actions for 2–4 s each time the
  // author switched tabs. Re-read Harness is the way to a fresh picture
  // (#1033 story 31).
  it("never fetches when the author returns to the tab", async () => {
    const calls = stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    await waitFor(() =>
      expect(
        calls.filter((call) => call === "POST /api/harness/refresh"),
      ).toHaveLength(1),
    );
    window.dispatchEvent(new Event("focus"));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(
      calls.filter((call) => call === "POST /api/harness/refresh"),
    ).toHaveLength(1);
  });

  it("says the read is running while it runs", async () => {
    let release = () => {};
    const heldUntil = new Promise<void>((resolve) => {
      release = resolve;
    });
    stubHarnessServer({
      read: { body: RELEASED },
      refresh: {
        body: {
          ...RELEASED,
          freshness: {
            outcome: "fetched",
            lastFetchedAt: "2026-08-03T11:56:00.000Z",
          },
        },
        heldUntil,
      },
    });
    renderHarness();

    // Heard, not seen: the table is busy and the status region says so; no
    // word stands in band 2 for a read (design.md → Waiting and freshness).
    const live = await screen.findByRole("status", { name: "Harness stages" });
    await waitFor(() => expect(live).toHaveTextContent("Reading GitHub…"));
    expect(
      within(await stripFacts()).queryByText("Reading GitHub…"),
    ).not.toBeInTheDocument();
    release();
    await waitFor(async () =>
      expect(
        within(await stripFacts()).getByText("Read 4 min ago"),
      ).toBeInTheDocument(),
    );
  });

  it("lists the merged skills that are waiting, with their readings", async () => {
    // The author column is gone: #827 states no author identity line on the
    // Harness view. The plan dialog still names authors (release-dialog).
    stubHarnessServer({
      read: {
        body: withStages(
          { ...RELEASED, releaseState: "pending-release" },
          {
            release: [
              row("pending-release", "research", "added"),
              row("pending-release", "tdd", "changed"),
            ],
          },
        ),
      },
    });
    renderHarness();

    expect(await stageHeader("Pending release")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /research/ })).toHaveTextContent(
      "Added",
    );
    expect(screen.getByRole("row", { name: /tdd/ })).toHaveTextContent(
      "Changed",
    );
  });

  it("holds offline apart from a read that failed, and dates both", async () => {
    stubHarnessServer({
      read: { body: RELEASED },
      refresh: {
        body: {
          ...RELEASED,
          freshness: {
            outcome: "offline",
            lastFetchedAt: "2026-08-03T11:00:00.000Z",
          },
        },
      },
    });
    renderHarness();

    expect(
      await screen.findByText("Offline — last read 1 h ago"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/read failed/i)).not.toBeInTheDocument();
  });

  it("never turns a failed read into a permission gate", async () => {
    stubHarnessServer({
      read: { body: RELEASED },
      refresh: {
        body: {
          ...RELEASED,
          freshness: { outcome: "fetch-failed", lastFetchedAt: null },
        },
      },
    });
    renderHarness();

    expect(
      await screen.findByText("Read failed — never read"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/permission|not allowed|access denied/i),
    ).not.toBeInTheDocument();
    // Re-read Harness is the one way back, so a failure must never close it.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Re-read Harness" }),
      ).not.toHaveAttribute("aria-disabled"),
    );
  });

  it("reads a harness before its first release as a normal day", async () => {
    stubHarnessServer({
      read: {
        body: {
          ...RELEASED,
          releasedVersion: null,
          releaseState: "never-released",
        },
      },
    });
    renderHarness();

    // The strip carries the reading now that the summary card is retired.
    expect(await screen.findByText("None yet")).toBeInTheDocument();
  });

  it("keeps the freshly fetched state when the slower read arrives late", async () => {
    // The read and the open-time refresh race. A read that resolves last must
    // not repaint the pre-fetch picture over the answer the refresh brought.
    let releaseRead = () => {};
    const heldUntil = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    stubHarnessServer({
      read: { body: RELEASED, heldUntil },
      refresh: {
        body: {
          ...RELEASED,
          freshness: {
            outcome: "fetched",
            lastFetchedAt: "2026-08-03T11:56:00.000Z",
          },
        },
      },
    });
    renderHarness();

    await waitFor(async () =>
      expect(
        within(await stripFacts()).getByText("Read 4 min ago"),
      ).toBeInTheDocument(),
    );
    releaseRead();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(
      within(await stripFacts()).getByText("Read 4 min ago"),
    ).toBeInTheDocument();
  });

  it("says when a refresh could not reach the server, and stays usable", async () => {
    stubHarnessServer({
      read: { body: RELEASED },
      refresh: { body: null, rejects: true },
    });
    renderHarness();

    // Polite, not assertive: the fetch fires on open, so nothing the author
    // did should interrupt them (#465).
    // The notice's own region, not the stage announcement beside it (#868).
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("status")
          .map((region) => region.textContent ?? "")
          .join(" "),
      ).toMatch(/GitHub/i),
    );
    // The state that is on screen is the last one that was read, so the
    // version still shows and the button is the way to try again.
    expect(screen.getByText("v0.5.0")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Re-read Harness" }),
      ).not.toHaveAttribute("aria-disabled"),
    );
  });

  it("groups what was pushed apart from what is still on disk", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          review: [row("pending-review", "code-review", "waiting-for-review")],
          proposal: [row("pending-proposal", "lint-rules", "not-yet-proposed")],
        }),
      },
    });
    renderHarness();

    const review = await stageRows("Pending review");
    const promotion = await stageRows("Pending proposal");
    expect(review.map((each) => each.textContent)).toEqual([
      expect.stringContaining("code-review"),
    ]);
    expect(promotion.map((each) => each.textContent)).toEqual([
      expect.stringContaining("lint-rules"),
    ]);
    // A skill in one stage keeps one row: the other stages hold none of it.
    expect(screen.getAllByText("code-review")).toHaveLength(1);
  });

  it("leaves out a confirmed empty stage", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          proposal: [row("pending-proposal", "lint-rules", "not-yet-proposed")],
        }),
      },
    });
    renderHarness();

    expect(
      (await stageHeaders()).map((header) =>
        STAGE_TITLES.find((title) => header.startsWith(title)),
      ),
    ).toEqual(["Pending proposal"]);
  });

  it("shows No changes yet on a confirmed empty journey", async () => {
    // Pending proposal always renders — it hosts Import skill… — so the empty
    // journey is stated there rather than leaving a page with nothing on it.
    stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    expect(await screen.findByText("No changes yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Skills you import or edit in your clone will appear here.",
      ),
    ).toBeInTheDocument();
    // The empty state repeats Import skill… from band 1 (#994).
    expect(
      screen.getAllByRole("button", { name: "Import skill…" }),
    ).toHaveLength(2);
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("gives one skill a row in every stage it belongs to", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          proposal: [
            row("pending-proposal", "tdd", "new-local-work", {
              comparison: { kind: "proposal", number: 45 },
              alsoIn: ["pending-review", "pending-release"],
            }),
          ],
          review: [
            row("pending-review", "tdd", "waiting-for-review", {
              requests: [pullRequest(45)],
              alsoIn: ["pending-proposal", "pending-release"],
            }),
          ],
          release: [
            row("pending-release", "tdd", "changed", {
              alsoIn: ["pending-proposal", "pending-review"],
            }),
          ],
        }),
      },
    });
    renderHarness();

    expect(await screen.findAllByText("tdd")).toHaveLength(3);
    expect(screen.getByText("New local work")).toBeInTheDocument();
    expect(screen.getByText("Waiting for review")).toBeInTheDocument();
    expect(screen.getByText("Changed")).toBeInTheDocument();
    // The Also in column names the other stages; the pane says it in full.
    expect(
      screen.getByText("Pending review, Pending release"),
    ).toBeInTheDocument();
    const pane = await openPane("tdd");
    expect(
      within(pane).getByText("Also in Pending review and Pending release."),
    ).toBeInTheDocument();
  });

  // #1045: the next step is one press away, from the row and from its pane.
  it("puts Propose change first in the row menu and at the foot of the pane", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          proposal: [
            row("pending-proposal", "tdd", "not-yet-proposed", {
              localOnly: true,
            }),
          ],
        }),
      },
    });
    renderHarness();

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Actions for tdd in Pending proposal",
      }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Propose change", "Delete skill"]);
    await userEvent.keyboard("{Escape}");

    const pane = await openPane("tdd");
    expect(
      within(pane)
        .getAllByRole("button")
        .map((button) => button.textContent)
        .filter((label) => label !== ""),
    ).toEqual(["Propose change", "Delete skill"]);
  });

  it("links a row's pull request number to GitHub, in a new tab", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          review: [
            row("pending-review", "tdd", "changes-requested", {
              requests: [pullRequest(47)],
            }),
          ],
        }),
      },
    });
    renderHarness();

    const [tdd] = await stageRows("Pending review");
    const link = within(tdd as HTMLElement).getByRole("link", {
      name: "Pull request #47, opens in a new tab",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/fimoklei/agent-harness/pull/47",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("links a Pending proposal row to the open request its local work follows", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          proposal: [
            row("pending-proposal", "tdd", "new-local-work", {
              requests: [pullRequest(47)],
              comparison: { kind: "proposal", number: 47 },
            }),
          ],
        }),
      },
    });
    renderHarness();

    const [tdd] = await stageRows("Pending proposal");
    expect(
      within(tdd as HTMLElement).getByRole("link", {
        name: "Pull request #47, opens in a new tab",
      }),
    ).toHaveAttribute(
      "href",
      "https://github.com/fimoklei/agent-harness/pull/47",
    );
  });

  it("states Origin, Released and Branch in band 2, beside the freshness line and Re-read Harness", async () => {
    stubHarnessServer({
      read: {
        body: {
          ...RELEASED,
          freshness: {
            outcome: "fetched",
            lastFetchedAt: "2026-08-03T11:56:00.000Z",
          },
        },
      },
    });
    renderHarness();

    const band = await band2();
    for (const [label, value] of [
      ["Origin", "github.com/fimoklei/agent-harness"],
      ["Released", "v0.5.0"],
      ["Branch", "main"],
    ]) {
      expect(within(band).getByText(label as string)).toBeInTheDocument();
      expect(within(band).getByText(value as string)).toBeInTheDocument();
    }
    expect(within(band).getByText("Read 4 min ago")).toBeInTheDocument();
    expect(
      within(band).getByRole("button", { name: "Re-read Harness" }),
    ).toBeInTheDocument();
  });

  it("names the requested reviewers, uncapped", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          review: [
            row("pending-review", "tdd", "waiting-for-review", {
              requests: [pullRequest(45)],
              reviewers: [
                { kind: "user", login: "ada" },
                { kind: "user", login: "bo" },
                { kind: "team", slug: "fimoklei/reviewers" },
              ],
            }),
          ],
        }),
      },
    });
    renderHarness();

    const pane = await openPane("tdd", "Pending review");
    expect(
      within(pane).getByText(
        "Review requested from @ada, @bo, @fimoklei/reviewers",
      ),
    ).toBeInTheDocument();
  });

  it("suppresses the cross-stage line where membership is unknown", async () => {
    stubHarnessServer({
      read: {
        body: {
          ...RELEASED,
          stages: {
            proposal: {
              outcome: "read",
              bound: null,
              rows: [
                row("pending-proposal", "tdd", "not-yet-proposed", {
                  alsoIn: null,
                }),
              ],
            },
            review: { outcome: "unavailable" },
            release: { outcome: "read", rows: [], bound: null },
          },
        },
      },
    });
    renderHarness();

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(screen.queryByText(/^Also in /)).not.toBeInTheDocument();
    // The unread stage replaces its whole meta slot and draws no card.
    expect(screen.getByText("Review status unavailable")).toBeInTheDocument();
  });

  it("never turns a clone that is only behind into work of your own", async () => {
    // The remote moved ahead of this checkout. That is the team's change, and
    // presenting it as a local movement would invite promoting old content.
    stubHarnessServer({
      read: { body: { ...RELEASED, releaseState: "pending-release" } },
    });
    renderHarness();

    await screen.findByRole("heading", { level: 1, name: /harness/i });
    expect(
      screen.queryByRole("cell", { name: /not yet proposed/i }),
    ).not.toBeInTheDocument();
  });

  it("reports a harness that is not connected instead of an empty screen", async () => {
    stubHarnessServer({
      read: {
        body: {
          error: "not-configured",
          message: "No Harness is connected. Set the Harness source path.",
        },
        status: 409,
      },
    });
    renderHarness();

    // A view that failed to load announces politely — nothing here followed
    // a press (#465).
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("status")
          .map((region) => region.textContent ?? "")
          .join(" "),
      ).toMatch(/No Harness connected/i),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
