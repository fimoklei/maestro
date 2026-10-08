import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { measureAs, sentence } from "../test-utils";
import {
  harnessRegion,
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

afterEach(() => {
  vi.restoreAllMocks();
});

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
          release: [
            row("pending-release", "research", "not-yet-released", {
              change: "addition",
            }),
          ],
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
            row("pending-release", "tdd", "not-yet-released"),
            row("pending-release", "lint-rules", "not-yet-released", {
              change: "addition",
            }),
            row("pending-release", "research", "not-yet-released", {
              change: "addition",
            }),
          ],
        }),
      },
    });
    renderHarness();

    // Three numbers, never a sum: one skill can hold a row in all three stages.
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

  it("announces a long read as every table screen does", async () => {
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

    await screen.findByRole("heading", { level: 1, name: "Harness" });
    await act(() => vi.advanceTimersByTimeAsync(1300));
    expect(harnessRegion()).toHaveTextContent("Loading the Harness…");
    expect(
      within(await stripFacts()).queryByText("Reading GitHub…"),
    ).not.toBeInTheDocument();
    release();
    await waitFor(async () =>
      expect(
        within(await stripFacts()).getByText("Read 4 min ago"),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(harnessRegion()).toHaveTextContent("Harness loaded."),
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
              row("pending-release", "research", "not-yet-released", {
                change: "addition",
              }),
              row("pending-release", "tdd", "not-yet-released"),
            ],
          },
        ),
      },
    });
    renderHarness();

    expect(await stageHeader("Pending release")).toBeInTheDocument();
    const research = screen.getByRole("row", { name: /research/ });
    expect(research).toHaveTextContent("Addition");
    expect(research).toHaveTextContent("Not yet released");
    expect(screen.getByRole("row", { name: /tdd/ })).toHaveTextContent("Edit");
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
    expect(await screen.findByText("Not released yet")).toBeInTheDocument();
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
    // Every stage drops out when empty, so the empty journey is stated rather
    // than leaving a page with nothing on it.
    stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    expect(await screen.findByText("No changes yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Skills you import or edit in your clone will appear here.",
      ),
    ).toBeInTheDocument();
    // The empty state repeats Import skill from band 1 (#994).
    expect(
      screen.getAllByRole("button", { name: "Import skill" }),
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
            row("pending-release", "tdd", "not-yet-released", {
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
    expect(screen.getByText("Not yet released")).toBeInTheDocument();
    // The Also in column names the other stages; the pane says it in full.
    expect(
      screen.getByText("Pending review, Pending release"),
    ).toBeInTheDocument();
    const pane = await openPane("tdd");
    expect(
      within(pane).getByText("Also in Pending review and Pending release."),
    ).toBeInTheDocument();
  });

  // #1184: the Type column drops out on a narrow panel; the pane keeps it.
  it("states the row's type as a fact in the pane", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          proposal: [row("pending-proposal", "tdd", "new-local-work")],
        }),
      },
    });
    renderHarness();

    const pane = await openPane("tdd");
    const type = within(pane).getByText("Type", { selector: "dt" });
    expect(type.nextElementSibling).toHaveTextContent("Skill");
  });

  // #1045: the next step is one press away, from the row and from its pane.
  it("puts Propose change first in the row menu and at the foot of the pane", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          proposal: [
            row("pending-proposal", "tdd", "not-yet-proposed", {
              localOnly: true,
              folderOnDisk: true,
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

  it("links the Origin fact to the Harness repository on GitHub", async () => {
    stubHarnessServer({
      read: {
        body: {
          ...RELEASED,
          github: {
            kind: "link",
            url: "https://github.com/fimoklei/agent-harness",
          },
        },
      },
    });
    renderHarness();

    const link = within(await band2()).getByRole("link", {
      name: "github.com/fimoklei/agent-harness on GitHub",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/fimoklei/agent-harness",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).not.toHaveAttribute("tabindex");
  });

  it("keeps the Origin fact plain text where it has no GitHub page", async () => {
    stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    const band = await band2();
    expect(
      within(band).getByText("github.com/fimoklei/agent-harness"),
    ).toBeInTheDocument();
    expect(within(band).queryByRole("link")).not.toBeInTheDocument();
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

  // What a row's change does to the Harness, apart from where it stands (#1399).
  describe("the Change column", () => {
    const stubbed = () =>
      stubHarnessServer({
        read: {
          body: withStages(RELEASED, {
            proposal: [
              row("pending-proposal", "tdd", "not-yet-proposed", {
                change: "addition",
              }),
            ],
            review: [
              row("pending-review", "lint-rules", "waiting-for-review", {
                change: "deletion",
                requests: [pullRequest(45, "lint-rules")],
              }),
            ],
            release: [
              row("pending-release", "research", "not-yet-released", {
                change: "rename",
                previousName: "explore",
              }),
            ],
          }),
        },
      });

    it("sits between Name and Status", async () => {
      stubbed();
      renderHarness();
      await stageHeader("Pending proposal");

      const headers = screen
        .getAllByRole("columnheader")
        .map((header) => header.textContent);
      expect(headers.indexOf("Change")).toBe(headers.indexOf("Name") + 1);
      expect(headers.indexOf("Status")).toBe(headers.indexOf("Change") + 1);
    });

    it("names each row's change in every stage group", async () => {
      stubbed();
      renderHarness();
      await stageHeader("Pending proposal");

      expect(screen.getByRole("row", { name: /tdd/ })).toHaveTextContent(
        "Addition",
      );
      const lintRules = screen.getByRole("row", { name: /lint-rules/ });
      expect(lintRules).toHaveTextContent("Deletion");
      expect(lintRules).toHaveTextContent("Waiting for review");
      expect(screen.getByRole("row", { name: /research/ })).toHaveTextContent(
        "Rename",
      );
    });

    it("states what the change does when the pointer rests on it", async () => {
      stubbed();
      renderHarness();
      await stageHeader("Pending proposal");

      await userEvent.hover(
        within(screen.getByRole("row", { name: /research/ })).getByText(
          "Rename",
        ),
      );

      expect(
        await screen.findByText(
          sentence(
            "This change renames explore to research in github.com/fimoklei/agent-harness.",
          ),
        ),
      ).toBeInTheDocument();
    });

    // One card per row on the keyboard: the Status card carries the sentence.
    it("states what the change does in the card the keyboard opens", async () => {
      stubbed();
      renderHarness();
      await stageHeader("Pending proposal");

      act(() => (screen.getByRole("grid") as HTMLElement).focus());

      expect(
        await screen.findByText(
          sentence(
            "This change adds tdd to github.com/fimoklei/agent-harness.",
          ),
        ),
      ).toBeInTheDocument();
    });

    it("opens the Status card on the keyboard: badge, sentences, then freshness", async () => {
      stubbed();
      renderHarness();
      await stageHeader("Pending proposal");

      act(() => (screen.getByRole("grid") as HTMLElement).focus());

      const change = await screen.findByText(
        sentence("This change adds tdd to github.com/fimoklei/agent-harness."),
      );
      const card = change.parentElement as HTMLElement;
      expect(card.firstElementChild).toHaveTextContent("Not yet proposed");
      expect(
        Array.from(card.querySelectorAll("p"), (line) => line.textContent),
      ).toEqual([
        "This skill is not on main yet. Select Propose change to send it for review.",
        "This change adds tdd to github.com/fimoklei/agent-harness.",
        "Not read yet",
      ]);
    });

    it("names the change in the detail pane", async () => {
      stubbed();
      renderHarness();
      await stageHeader("Pending proposal");

      const pane = await openPane("tdd");

      expect(within(pane).getByText("Change")).toBeInTheDocument();
      expect(within(pane).getByText("Addition")).toBeInTheDocument();
    });
  });

  // design.md → Disclosure: every card shares the frame; the keyboard opens
  // the Status card alone (#1445).
  describe("the Change and Pull request cards", () => {
    const CARD = "[data-radix-popper-content-wrapper]";
    const cardOf = (text: HTMLElement) => text.closest(CARD) as HTMLElement;
    const stubbed = () =>
      stubHarnessServer({
        read: {
          body: withStages(RELEASED, {
            review: [
              row("pending-review", "code-review", "changes-requested", {
                requests: [pullRequest(47, "code-review")],
                reviewers: [
                  { kind: "user", login: "sanne" },
                  { kind: "user", login: "joris" },
                ],
              }),
            ],
          }),
        },
      });
    const hoverRequest = (number: number) =>
      userEvent.hover(
        screen.getByRole("link", {
          name: `Pull request #${number}, opens in a new tab`,
        }),
      );

    it("opens the Change card to the pointer with its sentence alone", async () => {
      stubbed();
      renderHarness();
      await stageHeader("Pending review");

      await userEvent.hover(
        within(screen.getByRole("row", { name: /code-review/ })).getByText(
          "Edit",
        ),
      );

      const line = await screen.findByText(
        sentence(
          "This change edits code-review in github.com/fimoklei/agent-harness.",
        ),
      );
      expect(cardOf(line).textContent).toBe(line.textContent);
    });

    it("lays out the Pull request card's facts as the detail pane does", async () => {
      stubbed();
      renderHarness();
      await stageHeader("Pending review");

      await userEvent.hover(
        screen.getByRole("link", {
          name: "Pull request #47, opens in a new tab",
        }),
      );

      const card = cardOf(await screen.findByText("@sanne, @joris"));
      expect(card).toHaveTextContent(/^#47Open/);
      expect(
        within(card)
          .getAllByRole("term")
          .map((label) => label.textContent),
      ).toEqual(["Review", "Requested", "Branch"]);
      expect(
        within(card)
          .getAllByRole("definition")
          .map((value) => value.textContent),
      ).toEqual([
        "Changes requested",
        "@sanne, @joris",
        "maestro/code-review →into main",
      ]);
      // The link's own name already says where it goes (#1076).
      expect(within(card).queryByRole("link")).toBeNull();
    });

    it("sets the branches in mono, heard as one branch into the other", async () => {
      stubbed();
      renderHarness();
      await stageHeader("Pending review");

      await hoverRequest(47);

      const card = cardOf(await screen.findByText("@sanne, @joris"));
      const branch = within(card).getByText("Branch")
        .nextElementSibling as HTMLElement;
      expect(within(branch).getByText("maestro/code-review")).toHaveClass(
        "font-mono",
      );
      expect(within(branch).getByText("main")).toHaveClass("font-mono");
      expect(within(branch).getByText("→")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
      expect(within(branch).getByText("into")).toHaveClass("sr-only");
    });

    it("keeps every pull request's branch in the card", async () => {
      stubHarnessServer({
        read: {
          body: withStages(RELEASED, {
            review: [
              row("pending-review", "code-review", "multiple-pull-requests", {
                requests: [
                  pullRequest(51, "code-review"),
                  {
                    ...pullRequest(52, "code-review"),
                    headBranch: "fix/other",
                  },
                ],
              }),
            ],
          }),
        },
      });
      renderHarness();
      await stageHeader("Pending review");

      await hoverRequest(51);

      const card = cardOf(await screen.findByText("fix/other"));
      expect(
        within(card)
          .getAllByRole("definition")
          .map((value) => value.textContent),
      ).toEqual([
        "#51 maestro/code-review →into main",
        "#52 fix/other →into main",
      ]);
    });

    it("shows only the number and branch on a Pending proposal row", async () => {
      // The row's status is the local work's, not the request's (#1076).
      stubHarnessServer({
        read: {
          body: withStages(RELEASED, {
            proposal: [
              row("pending-proposal", "code-review", "new-local-work", {
                requests: [pullRequest(47, "code-review")],
                comparison: { kind: "proposal", number: 47 },
              }),
            ],
          }),
        },
      });
      renderHarness();
      await stageHeader("Pending proposal");

      await hoverRequest(47);

      const card = await waitFor(() => {
        const open = document.querySelector<HTMLElement>(CARD);
        if (open === null) throw new Error("No card is open yet");
        return open;
      });
      expect(card).toHaveTextContent(/^#47Branch/);
      expect(within(card).queryByText("Open")).toBeNull();
      expect(within(card).queryByText("Review")).toBeNull();
    });

    it("opens one card on the keyboard's active row, the Status card", async () => {
      stubbed();
      renderHarness();
      await stageHeader("Pending review");

      act(() => (screen.getByRole("grid") as HTMLElement).focus());

      const status = await screen.findByText(
        "Review requested from @sanne, @joris",
      );
      expect(cardOf(status)).toHaveTextContent(/^Changes requested/);
      expect(document.querySelectorAll(CARD)).toHaveLength(1);
    });
  });

  it("reveals a shortened skill name through the tooltip, not a native title", async () => {
    measureAs(300, 100);
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          proposal: [row("pending-proposal", "lint-rules", "not-yet-proposed")],
        }),
      },
    });
    renderHarness();

    const name = await screen.findByText("lint-rules");
    await userEvent.hover(name);

    expect(
      await screen.findByRole("tooltip", { hidden: true }),
    ).toHaveTextContent("lint-rules");
    expect(name).not.toHaveAttribute("title");
  });
});
