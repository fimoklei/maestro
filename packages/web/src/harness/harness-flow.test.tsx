import type {
  HarnessStage,
  HarnessStageRow,
  HarnessState,
  StageStatus,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { HarnessView } from "./harness-view";

const RELEASED: HarnessState = {
  origin: "github.com/fimoklei/agent-harness",
  releasedVersion: "v0.5.0",
  defaultBranch: "main",
  releaseState: "released",
  freshness: { outcome: null, lastFetchedAt: null },
  stages: {
    proposal: { outcome: "read", rows: [], bound: null },
    review: { outcome: "read", rows: [], bound: null },
    release: { outcome: "read", rows: [], bound: null },
  },
};

// One stage row with every field a test does not care about already settled.
const row = (
  stage: HarnessStage,
  skill: string,
  status: StageStatus,
  over: Partial<HarnessStageRow> = {},
): HarnessStageRow => ({
  stage,
  skill,
  status,
  deletion: false,
  requests: [],
  reviewers: [],
  comparison: stage === "pending-proposal" ? { kind: "default-branch" } : null,
  alsoIn: [],
  concurrentChange: false,
  remoteTree: null,
  previousName: null,
  ...over,
});

// The state a stage's rows make, leaving the other two confirmed empty.
const withStages = (
  state: HarnessState,
  rows: Partial<Record<"proposal" | "review" | "release", HarnessStageRow[]>>,
): HarnessState => ({
  ...state,
  stages: {
    proposal: { outcome: "read", rows: rows.proposal ?? [], bound: null },
    review: { outcome: "read", rows: rows.review ?? [], bound: null },
    release: { outcome: "read", rows: rows.release ?? [], bound: null },
  },
});

// One stub for both routes, so a test states what the read says and what the
// refresh finds, and nothing else.
function stubHarnessServer(options: {
  read: {
    body: unknown;
    status?: number;
    heldUntil?: Promise<void>;
    afterPublish?: unknown;
    afterPromote?: unknown;
  };
  refresh?: {
    body: unknown;
    status?: number;
    rejects?: boolean;
    heldUntil?: Promise<void>;
    afterPublish?: unknown;
  };
  // One entry per plan request, so a test can hold the second one and read
  // what the reopened dialog shows while it is still in flight.
  plan?: {
    body: unknown;
    status?: number;
    holds?: (Promise<void> | undefined)[];
  };
  // A confirmed publish. `afterPublish` on either route is what that route
  // answers once it has gone through, so a test can say which of the two the
  // quiet state is painted from. `retry` answers every call after the first, so
  // a refusal followed by a retry is one stub.
  publish?: {
    body: unknown;
    status?: number;
    retry?: { body: unknown; status?: number };
  };
  // A promotion of one skill. `afterPromote` on the read is the picture the
  // invalidated query then paints, so a test can state where the row moved to.
  promote?: { body: unknown; status?: number };
  // Every promotion's parsed body, in order, so a test can state which skill
  // the row action named.
  promotions?: Record<string, unknown>[];
  // Publishing a removal, and every confirmation's parsed body in order — so a
  // test can state what the confirmation carried without reading it back off
  // the screen. `retry` answers every call after the first.
  deletion?: {
    body: unknown;
    status?: number;
    retry?: { body: unknown; status?: number };
  };
  deletions?: Record<string, unknown>[];
  // Every release confirmation's parsed body, in order, so a test can state
  // what the browser sent without reading it back off the screen.
  confirmations?: Record<string, unknown>[];
}) {
  const calls: string[] = [];
  let planCalls = 0;
  let publishCalls = 0;
  let deletionCalls = 0;
  let published = false;
  let promoted = false;
  const answer = (route: {
    body: unknown;
    afterPublish?: unknown;
    afterPromote?: unknown;
  }) => {
    if (published && "afterPublish" in route) {
      return route.afterPublish;
    }
    return promoted && "afterPromote" in route
      ? route.afterPromote
      : route.body;
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.startsWith("/api/harness/release-plan")) {
        const plan = options.plan ?? { body: {}, status: 500 };
        await ("holds" in plan ? plan.holds?.[planCalls] : undefined);
        planCalls += 1;
        return jsonResponse(plan.body, plan.status);
      }
      if (url === "/api/harness/promote/deletion") {
        options.deletions?.push(JSON.parse(String(init?.body)));
        const first = options.deletion ?? { body: {}, status: 500 };
        const answered =
          deletionCalls > 0 && first.retry !== undefined ? first.retry : first;
        deletionCalls += 1;
        if ((answered.status ?? 200) < 400) {
          promoted = true;
        }
        return jsonResponse(answered.body, answered.status);
      }
      if (url === "/api/harness/promote") {
        options.promotions?.push(JSON.parse(String(init?.body)));
        const push = options.promote ?? { body: {}, status: 500 };
        if ((push.status ?? 200) < 400) {
          promoted = true;
        }
        return jsonResponse(push.body, push.status);
      }
      if (url === "/api/harness/release") {
        options.confirmations?.push(JSON.parse(String(init?.body)));
        const first = options.publish ?? { body: {}, status: 500 };
        const pub =
          publishCalls > 0 && first.retry !== undefined ? first.retry : first;
        publishCalls += 1;
        if ((pub.status ?? 200) < 400) {
          published = true;
        }
        return jsonResponse(pub.body, pub.status);
      }
      if (url.startsWith("/api/harness/refresh")) {
        const refresh = options.refresh ?? options.read;
        if ("rejects" in refresh && refresh.rejects === true) {
          throw new TypeError("Failed to fetch");
        }
        await ("heldUntil" in refresh ? refresh.heldUntil : undefined);
        return jsonResponse(answer(refresh), refresh.status);
      }
      // Held by the test rather than by a timer, so the race is decided by
      // hand and not by the clock (testing.md — deterministic).
      await options.read.heldUntil;
      return jsonResponse(answer(options.read), options.read.status);
    }),
  );
  return calls;
}

function renderHarness() {
  // StrictMode, because the real app mounts under it and replays every effect
  // — the open-time refresh must still be one request.
  return renderWithQuery(
    <StrictMode>
      <HarnessView />
    </StrictMode>,
  );
}

beforeEach(() => {
  // A fixed clock, so "4 min ago" is the same sentence on every run.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Harness home base", () => {
  it("names the repository it is about", async () => {
    stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    expect(
      await screen.findByRole("heading", { level: 2, name: /harness/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("github.com/fimoklei/agent-harness"),
    ).toBeInTheDocument();
  });

  it("shows the released version and the branch a release would tag", async () => {
    stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    expect(await screen.findByText("v0.5.0")).toBeInTheDocument();
    expect(await screen.findByText("main")).toBeInTheDocument();
  });

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

    expect(await screen.findByText("Fetched 4 min ago")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        calls.filter((call) => call === "POST /api/harness/refresh"),
      ).toHaveLength(1),
    );
  });

  it("fetches again on Refresh", async () => {
    const calls = stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    // The open-time refresh disables the button while it runs; clicking into
    // that window would land on nothing.
    const button = await screen.findByRole("button", { name: /refresh/i });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    await waitFor(() =>
      expect(
        calls.filter((call) => call === "POST /api/harness/refresh"),
      ).toHaveLength(2),
    );
  });

  it("reads a quiet harness as nothing waiting", async () => {
    stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    expect(
      await screen.findByText("Everything merged is released."),
    ).toBeInTheDocument();
  });

  it("says plainly when merged work is waiting for a release", async () => {
    stubHarnessServer({
      read: { body: { ...RELEASED, releaseState: "pending-release" } },
    });
    renderHarness();

    expect(
      await screen.findByText("Merged changes are waiting for release."),
    ).toBeInTheDocument();
  });

  it("lists the merged skills that are waiting, with their green readings", async () => {
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

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: /pending release/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /research/ })).toHaveTextContent(
      "Added",
    );
    expect(screen.getByRole("row", { name: /tdd/ })).toHaveTextContent(
      "Changed",
    );
  });

  it("holds offline apart from a fetch that failed, and dates both", async () => {
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
      await screen.findByText("Offline — last fetched 1 h ago"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/fetch failed/i)).not.toBeInTheDocument();
  });

  it("never turns a failed fetch into a permission gate", async () => {
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
      await screen.findByText("Fetch failed — never fetched"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/permission|not allowed|access denied/i),
    ).not.toBeInTheDocument();
    // Refresh is the one way back, so a failure must never disable it.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /refresh/i })).toBeEnabled(),
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

    expect(await screen.findByText("No release yet.")).toBeInTheDocument();
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

    expect(await screen.findByText("Fetched 4 min ago")).toBeInTheDocument();
    releaseRead();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Fetched 4 min ago")).toBeInTheDocument();
  });

  it("says when a refresh could not reach the server, and stays usable", async () => {
    stubHarnessServer({
      read: { body: RELEASED },
      refresh: { body: null, rejects: true },
    });
    renderHarness();

    // Polite, not assertive: the fetch fires on open, so nothing the author
    // did should interrupt them (#465).
    expect(await screen.findByRole("status")).toHaveTextContent(/GitHub/i);
    // The state that is on screen is the last one that was read, so the
    // version still shows and the button is the way to try again.
    expect(screen.getByText("v0.5.0")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /refresh/i })).toBeEnabled(),
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

    const review = (
      await screen.findByRole("heading", { level: 3, name: /pending review/i })
    ).closest("section");
    const promotion = (
      await screen.findByRole("heading", {
        level: 3,
        name: /pending proposal/i,
      })
    ).closest("section");
    expect(
      within(review as HTMLElement).getByText("code-review"),
    ).toBeVisible();
    expect(
      within(promotion as HTMLElement).getByText("lint-rules"),
    ).toBeVisible();
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
      await screen.findByRole("heading", {
        level: 3,
        name: /pending proposal/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: /pending review/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: /pending release/i }),
    ).not.toBeInTheDocument();
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
    expect(
      screen.getByRole("button", { name: /import skill/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
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
              requests: [
                {
                  number: 45,
                  url: "https://github.com/fimoklei/agent-harness/pull/45",
                },
              ],
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
    expect(
      screen.getByText("Also in Pending review and Pending release."),
    ).toBeInTheDocument();
  });

  it("names the requested reviewers, uncapped", async () => {
    stubHarnessServer({
      read: {
        body: withStages(RELEASED, {
          review: [
            row("pending-review", "tdd", "waiting-for-review", {
              requests: [
                {
                  number: 45,
                  url: "https://github.com/fimoklei/agent-harness/pull/45",
                },
              ],
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

    expect(
      await screen.findByText(
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

    expect(
      await screen.findByText("Merged changes are waiting for release."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("cell", { name: /not yet proposed/i }),
    ).not.toBeInTheDocument();
  });

  const FETCHED: HarnessState = {
    ...RELEASED,
    releaseState: "pending-release",
    freshness: {
      outcome: "fetched",
      lastFetchedAt: "2026-08-03T11:56:00.000Z",
    },
  };

  const PLAN = {
    delta: [{ kind: "added", name: "research", author: "Grace" }],
    previousTag: "v1.2.3",
    previousTagCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    proposedStep: "minor",
    reason: "A skill was added.",
    versions: { major: "v2.0.0", minor: "v1.3.0", patch: "v1.2.4" },
    revision: "0123456789abcdef0123456789abcdef01234567",
    defaultBranch: "main",
    findings: [{ skill: "broken", problem: "missing-manifest" }],
  };

  it("keeps Release out of reach until a fetch has answered", async () => {
    stubHarnessServer({
      read: {
        body: {
          ...RELEASED,
          freshness: { outcome: "offline", lastFetchedAt: null },
        },
      },
    });
    renderHarness();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^plan release$/i }),
      ).toBeDisabled(),
    );
  });

  it("opens a consequences-first plan when the author asks to release", async () => {
    stubHarnessServer({ read: { body: FETCHED }, plan: { body: PLAN } });
    renderHarness();

    const release = await screen.findByRole("button", {
      name: /^plan release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("v1.3.0")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/proposed v1\.3\.0 — A skill was added\./),
    ).toBeInTheDocument();
    // The advisory finding shows without disabling anything (#519).
    expect(within(dialog).getByText(/broken/)).toBeInTheDocument();
  });

  it("keeps Release out of reach while a refresh is still moving the refs", async () => {
    // A refresh rewrites the very refs a plan reads. Planning across one can
    // price a release from a revision that no longer stands (#519).
    let finishRefresh = () => {};
    const heldUntil = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    stubHarnessServer({
      read: { body: FETCHED },
      refresh: { body: FETCHED, heldUntil },
    });
    renderHarness();

    const release = await screen.findByRole("button", {
      name: /^plan release$/i,
    });
    await waitFor(() => expect(release).toBeDisabled());

    finishRefresh();

    await waitFor(() => expect(release).toBeEnabled());
  });

  it("never stands the last plan in for the one being fetched again", async () => {
    let answerSecond = () => {};
    const secondPlan = new Promise<void>((resolve) => {
      answerSecond = resolve;
    });
    stubHarnessServer({
      read: { body: FETCHED },
      plan: { body: PLAN, holds: [undefined, secondPlan] },
    });
    renderHarness();

    const release = await screen.findByRole("button", {
      name: /^plan release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    expect(await screen.findByText("v1.3.0")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    await userEvent.click(release);

    // A plan is a snapshot of one moment. The delta may have moved since, so
    // the old numbers must not stand in while the new ones are in flight.
    expect(
      await screen.findByText(/loading the release plan/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("v1.3.0")).not.toBeInTheDocument();

    answerSecond();
  });

  it("publishes the chosen step and settles into the quiet state read from the remote", async () => {
    // The local tag mirror the plain read paints from can fail to be written,
    // so the picture after a publish is fetched rather than read (#520).
    stubHarnessServer({
      read: { body: FETCHED },
      refresh: {
        body: FETCHED,
        afterPublish: { ...RELEASED, releasedVersion: "v1.3.0" },
      },
      plan: { body: PLAN },
      publish: { body: { tag: "v1.3.0", revision: PLAN.revision } },
    });
    renderHarness();

    const release = await screen.findByRole("button", {
      name: /^plan release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");

    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("v1.3.0")).toBeInTheDocument();
  });

  it("falls back to a plain read when the post-publish fetch cannot reach the remote", async () => {
    // The release is already on the remote; a fetch that fails afterwards is
    // never allowed to report the publish itself as failed (#520).
    stubHarnessServer({
      read: {
        body: FETCHED,
        afterPublish: { ...RELEASED, releasedVersion: "v1.3.0" },
      },
      refresh: { body: FETCHED, rejects: true },
      plan: { body: PLAN },
      publish: { body: { tag: "v1.3.0", revision: PLAN.revision } },
    });
    renderHarness();

    const release = await screen.findByRole("button", {
      name: /^plan release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");

    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("v1.3.0")).toBeInTheDocument();
  });

  // The plan the server recomputes after refusing the one above: a release
  // further along, priced from the tag that appeared while the author decided.
  const RECOMPUTED = {
    ...PLAN,
    previousTag: "v1.3.0",
    previousTagCommit: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    proposedStep: "patch",
    reason: "Nothing has changed since the last release.",
    versions: { major: "v2.0.0", minor: "v1.4.0", patch: "v1.3.1" },
    revision: "89abcdef0123456789abcdef0123456789abcdef",
  };

  it("sends the previous tag and revision the plan was priced from", async () => {
    const confirmations: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: FETCHED },
      plan: { body: PLAN },
      publish: { body: { tag: "v1.3.0", revision: PLAN.revision } },
      confirmations,
    });
    renderHarness();

    const release = await screen.findByRole("button", {
      name: /^plan release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    await waitFor(() => expect(confirmations).toHaveLength(1));
    expect(confirmations[0]).toEqual({
      step: "minor",
      previousTag: "v1.2.3",
      previousTagCommit: PLAN.previousTagCommit,
      revision: PLAN.revision,
    });
  });

  it("shows the recomputed plan in place when the remote moved under the old one", async () => {
    stubHarnessServer({
      read: { body: FETCHED },
      plan: { body: PLAN },
      publish: {
        body: {
          error: "plan-changed",
          plan: RECOMPUTED,
        },
        status: 409,
      },
    });
    renderHarness();

    const release = await screen.findByRole("button", {
      name: /^plan release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(
        /GitHub moved while this dialog was open/i,
      ),
    ).toBeInTheDocument();
    // The numbers the refusal replaced them with, and none of the old ones.
    expect(within(dialog).getByText("v1.3.1")).toBeInTheDocument();
    expect(within(dialog).getByText("v1.3.0")).toBeInTheDocument();
    expect(within(dialog).queryByText(PLAN.revision)).not.toBeInTheDocument();
  });

  it("drops the author's old step choice with the plan it belonged to", async () => {
    // "major" against v1.2.3 is v2.0.0; against the recomputed v1.3.0 it is a
    // different release entirely. Carrying the choice over would confirm a
    // version the author never picked (#521).
    stubHarnessServer({
      read: { body: FETCHED },
      plan: { body: PLAN },
      publish: {
        body: {
          error: "plan-changed",
          plan: RECOMPUTED,
        },
        status: 409,
      },
    });
    renderHarness();

    const release = await screen.findByRole("button", {
      name: /^plan release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(screen.getByRole("button", { name: /^major$/i }));
    expect(await screen.findByText("v2.0.0")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    // Back on the recomputed plan's own proposal, not the old choice's v2.0.0.
    expect(await screen.findByText("v1.3.1")).toBeInTheDocument();
    expect(screen.queryByText("v2.0.0")).not.toBeInTheDocument();
  });

  it("confirms the recomputed plan without reopening the dialog", async () => {
    const confirmations: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: FETCHED },
      refresh: {
        body: FETCHED,
        afterPublish: { ...RELEASED, releasedVersion: "v1.3.1" },
      },
      plan: { body: PLAN },
      publish: {
        body: {
          error: "plan-changed",
          plan: RECOMPUTED,
        },
        status: 409,
        retry: { body: { tag: "v1.3.1", revision: RECOMPUTED.revision } },
      },
      confirmations,
    });
    renderHarness();

    const release = await screen.findByRole("button", {
      name: /^plan release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );
    await screen.findByText("v1.3.1");

    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(confirmations[1]).toEqual({
      step: "patch",
      previousTag: "v1.3.0",
      previousTagCommit: RECOMPUTED.previousTagCommit,
      revision: RECOMPUTED.revision,
    });
  });

  it("plans again when a refusal carries no recomputed plan", async () => {
    // The recompute had no answer of its own. The old numbers must not stand:
    // the dialog asks for a new plan rather than showing a refused one.
    const calls = stubHarnessServer({
      read: { body: FETCHED },
      plan: { body: PLAN },
      publish: {
        body: {
          error: "plan-changed",
        },
        status: 409,
      },
    });
    renderHarness();

    const release = await screen.findByRole("button", {
      name: /^plan release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    await waitFor(() =>
      expect(
        calls.filter((call) => call.includes("/api/harness/release-plan")),
      ).toHaveLength(2),
    );
  });

  // Three shapes the dialog would crash on or render blank. Each must read as
  // "no recomputed plan" and send the author back for a fresh one (#521).
  it.each([
    ["a missing version map", { versions: undefined }],
    ["a movement that is not one", { delta: [null] }],
    ["a step the dialog has no version for", { proposedStep: "sideways" }],
  ])("plans again rather than paint %s", async (_name, broken) => {
    const calls = stubHarnessServer({
      read: { body: FETCHED },
      plan: { body: PLAN },
      publish: {
        body: {
          error: "plan-changed",
          plan: { ...RECOMPUTED, ...broken },
        },
        status: 409,
      },
    });
    renderHarness();

    const release = await screen.findByRole("button", {
      name: /^plan release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    await waitFor(() =>
      expect(
        calls.filter((call) => call.includes("/api/harness/release-plan")),
      ).toHaveLength(2),
    );
  });

  it("keeps the dialog open and states a failed publish as a readable error", async () => {
    stubHarnessServer({
      read: { body: FETCHED },
      plan: { body: PLAN },
      publish: {
        body: {
          error: "already-released",
        },
        status: 409,
      },
    });
    renderHarness();

    const release = await screen.findByRole("button", {
      name: /^plan release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");

    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        /Maestro rebuilt the plan against the newest release/i,
      ),
    ).toBeInTheDocument();
  });

  // One skill waiting on disk, and the picture once it has been pushed: the row
  // moves because the harness read says so, never because the browser kept a
  // receipt of the press (#577).
  const ON_DISK: HarnessState = {
    ...RELEASED,
    freshness: {
      outcome: "fetched",
      lastFetchedAt: "2026-08-03T11:56:00.000Z",
    },
    stages: {
      proposal: {
        outcome: "read",
        bound: null,
        rows: [
          row("pending-proposal", "lint-rules", "not-yet-proposed"),
          row("pending-proposal", "code-review", "not-yet-proposed"),
        ],
      },
      review: { outcome: "read", rows: [], bound: null },
      release: { outcome: "read", rows: [], bound: null },
    },
  };

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

  // Every action lives in the row menu now, so a press opens it first.
  const openRowMenu = async (skill: string) => {
    await userEvent.click(
      await screen.findByRole("button", { name: `Actions for ${skill}` }),
    );
    return screen.findByRole("menu");
  };

  const promoteRow = async (skill: string) => {
    const menu = await openRowMenu(skill);
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /^propose change$/i }),
    );
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

    const warned = (await screen.findByText("lint-rules")).closest(
      "tr",
    ) as HTMLElement;
    expect(
      within(warned).getByText(/Pull it into the Harness clone/i),
    ).toBeInTheDocument();
    const untouched = screen
      .getByText("code-review")
      .closest("tr") as HTMLElement;
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

    const review = (
      await screen.findByRole("heading", { level: 3, name: /pending review/i })
    ).closest("section") as HTMLElement;
    expect(within(review).getByText("lint-rules")).toBeVisible();
    expect(within(review).getByText("Pull request missing")).toBeVisible();
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

    // Nothing to press yet on a pushed row: its menu holds no item at all
    // until #844 adds Create pull request.
    await screen.findByText("lint-rules");
    expect(
      screen.getByRole("button", { name: "Actions for lint-rules" }),
    ).toBeDisabled();
  });

  it("keeps the pull-request link through a refresh and a remount", async () => {
    // The link is read from the state, never kept in the component: rebuilding
    // the client and remounting the view must not lose it (user story 12).
    const OPEN_REQUEST = withStages(ON_DISK, {
      review: [
        row("pending-review", "lint-rules", "waiting-for-review", {
          requests: [
            {
              number: 45,
              url: "https://github.com/fimoklei/agent-harness/pull/45",
            },
          ],
        }),
      ],
    });
    stubHarnessServer({ read: { body: OPEN_REQUEST } });
    const first = renderWithQuery(<HarnessView />);
    const before = await openRowMenu("lint-rules");
    expect(
      within(before).getByRole("menuitem", { name: /open pull request/i }),
    ).toHaveAttribute(
      "href",
      "https://github.com/fimoklei/agent-harness/pull/45",
    );

    first.unmount();
    renderWithQuery(<HarnessView />);

    const after = await openRowMenu("lint-rules");
    expect(
      within(after).getByRole("menuitem", { name: /open pull request/i }),
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
              requests: [
                {
                  number: 41,
                  url: "https://github.com/fimoklei/agent-harness/pull/41",
                },
                {
                  number: 44,
                  url: "https://github.com/fimoklei/agent-harness/pull/44",
                },
              ],
            }),
          ],
        }),
      },
    });
    renderHarness();

    expect(
      await screen.findByText(
        "Pull requests #41 and #44 both match this branch, so close one on GitHub.",
      ),
    ).toBeInTheDocument();
    const menu = await openRowMenu("lint-rules");
    expect(
      within(menu).getByRole("menuitem", { name: "Open pull request #41" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Open pull request #44" }),
    ).toBeInTheDocument();
  });

  // A removal never publishes by a single press: the confirmation states what
  // will be removed and carries the origin/HEAD tree the row was painted from,
  // so a remote that moved under it refuses rather than removes (#580).
  const DELETED: HarnessState = withStages(ON_DISK, {
    proposal: [
      row("pending-proposal", "old-skill", "deleted-locally", {
        deletion: true,
        remoteTree: "abc123",
      }),
      row("pending-proposal", "code-review", "not-yet-proposed"),
    ],
  });

  const REMOVED = {
    branch: "maestro/old-skill",
    pullRequestUrl:
      "https://github.com/fimoklei/agent-harness/compare/main...maestro/old-skill?expand=1",
  };

  const openDeletionConfirmation = async () => {
    await promoteRow("old-skill");
    return screen.findByRole("dialog", { name: /remove old-skill/i });
  };

  it("asks for a confirmation on a deletion, and pushes nothing until it is given", async () => {
    const deletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: DELETED },
      deletion: { body: REMOVED },
      deletions,
    });
    renderHarness();

    const dialog = await openDeletionConfirmation();

    expect(within(dialog).getAllByText("old-skill").length).toBeGreaterThan(0);
    expect(deletions).toEqual([]);
  });

  it("carries the origin/HEAD tree the row was shown into the confirmation", async () => {
    const deletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: DELETED },
      deletion: { body: REMOVED },
      deletions,
    });
    renderHarness();
    const dialog = await openDeletionConfirmation();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^remove skill$/i }),
    );

    await waitFor(() =>
      expect(deletions).toEqual([
        { name: "old-skill", seenRemoteTree: "abc123" },
      ]),
    );
  });

  it("moves the confirmed row to Pending review as a deletion", async () => {
    stubHarnessServer({
      read: {
        body: DELETED,
        afterPromote: withStages(DELETED, {
          review: [
            row("pending-review", "old-skill", "pull-request-missing", {
              deletion: true,
            }),
          ],
        }),
      },
      deletion: { body: REMOVED },
    });
    renderHarness();
    const dialog = await openDeletionConfirmation();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^remove skill$/i }),
    );

    const review = (
      await screen.findByRole("heading", { level: 3, name: /pending review/i })
    ).closest("section") as HTMLElement;
    expect(within(review).getByText("old-skill")).toBeVisible();
    expect(within(review).getByText("Pull request missing")).toBeVisible();
  });

  it("states a refused confirmation in the dialog, and asks for a new one", async () => {
    const deletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: DELETED },
      deletion: {
        body: {
          error: "confirmation-stale",
          message:
            "The skill on the default branch is no longer the one you confirmed removing. Nothing was pushed — refresh and confirm again.",
        },
        status: 409,
        retry: { body: REMOVED },
      },
      deletions,
    });
    renderHarness();
    const dialog = await openDeletionConfirmation();
    const confirm = within(dialog).getByRole("button", {
      name: /^remove skill$/i,
    });

    await userEvent.click(confirm);

    expect(
      await within(dialog).findByText(/Remove skill again/i),
    ).toBeInTheDocument();
    // The dialog stays open with the press still there: a refusal changed
    // nothing, so the way forward is another confirmation.
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);

    await waitFor(() => expect(deletions).toHaveLength(2));
  });

  it("states an ambiguous working tree in the dialog, without publishing anything", async () => {
    stubHarnessServer({
      read: { body: DELETED },
      deletion: {
        body: {
          error: "merge-in-progress",
        },
        status: 409,
      },
    });
    renderHarness();
    const dialog = await openDeletionConfirmation();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^remove skill$/i }),
    );

    expect(
      await within(dialog).findByText(/a half-merged working tree/i),
    ).toBeInTheDocument();
  });

  it("closes the confirmation without publishing when it is dismissed", async () => {
    const deletions: Record<string, unknown>[] = [];
    stubHarnessServer({
      read: { body: DELETED },
      deletion: { body: REMOVED },
      deletions,
    });
    renderHarness();
    const dialog = await openDeletionConfirmation();

    await userEvent.click(
      within(dialog).getByRole("button", { name: /^cancel$/i }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /remove old-skill/i }),
      ).toBeNull(),
    );
    expect(deletions).toEqual([]);
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
    expect(await screen.findByRole("status")).toHaveTextContent(
      /No Harness connected/i,
    );
  });
});
