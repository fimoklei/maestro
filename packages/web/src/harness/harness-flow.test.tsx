import type { HarnessState } from "@maestro/core";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  pendingRelease: [],
  freshness: { outcome: null, lastFetchedAt: null },
  movements: [],
};

// One stub for both routes, so a test states what the read says and what the
// refresh finds, and nothing else.
function stubHarnessServer(options: {
  read: {
    body: unknown;
    status?: number;
    heldUntil?: Promise<void>;
    afterPublish?: unknown;
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
  // Every release confirmation's parsed body, in order, so a test can state
  // what the browser sent without reading it back off the screen.
  confirmations?: Record<string, unknown>[];
}) {
  const calls: string[] = [];
  let planCalls = 0;
  let publishCalls = 0;
  let published = false;
  const answer = (route: { body: unknown; afterPublish?: unknown }) =>
    published && "afterPublish" in route ? route.afterPublish : route.body;
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

  it("lists the merged skills that are waiting, with their authors", async () => {
    stubHarnessServer({
      read: {
        body: {
          ...RELEASED,
          releaseState: "pending-release",
          pendingRelease: [
            { kind: "added", name: "research", author: "Grace" },
            { kind: "changed", name: "tdd", author: "Ada" },
          ],
        },
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
      "Grace",
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

    expect(await screen.findByRole("alert")).toHaveTextContent(/refresh/i);
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
        body: {
          ...RELEASED,
          movements: [
            { skill: "code-review", state: "pending-review" },
            { skill: "lint-rules", state: "pending-promotion" },
          ],
        },
      },
    });
    renderHarness();

    const review = (
      await screen.findByRole("heading", { level: 3, name: /pending review/i })
    ).closest("section");
    const promotion = (
      await screen.findByRole("heading", {
        level: 3,
        name: /pending promotion/i,
      })
    ).closest("section");
    expect(
      within(review as HTMLElement).getByText("code-review"),
    ).toBeVisible();
    expect(
      within(promotion as HTMLElement).getByText("lint-rules"),
    ).toBeVisible();
    // One skill, one table: a row never repeats its own state elsewhere.
    expect(screen.getAllByText("code-review")).toHaveLength(1);
  });

  it("leaves out a section that holds nothing", async () => {
    stubHarnessServer({
      read: {
        body: {
          ...RELEASED,
          movements: [{ skill: "lint-rules", state: "pending-promotion" }],
        },
      },
    });
    renderHarness();

    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: /pending promotion/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/pending review/i)).not.toBeInTheDocument();
  });

  it("shows no movement tables on a quiet day", async () => {
    stubHarnessServer({ read: { body: RELEASED } });
    renderHarness();

    expect(
      await screen.findByText("Everything merged is released."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
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
    expect(screen.queryByText(/pending promotion/i)).not.toBeInTheDocument();
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
      expect(screen.getByRole("button", { name: /^release$/i })).toBeDisabled(),
    );
  });

  it("opens a consequences-first plan when the author asks to release", async () => {
    stubHarnessServer({ read: { body: FETCHED }, plan: { body: PLAN } });
    renderHarness();

    const release = await screen.findByRole("button", { name: /^release$/i });
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

    const release = await screen.findByRole("button", { name: /^release$/i });
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

    const release = await screen.findByRole("button", { name: /^release$/i });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    expect(await screen.findByText("v1.3.0")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    await userEvent.click(release);

    // A plan is a snapshot of one moment. The delta may have moved since, so
    // the old numbers must not stand in while the new ones are in flight.
    expect(await screen.findByText(/planning/i)).toBeInTheDocument();
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

    const release = await screen.findByRole("button", { name: /^release$/i });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");

    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

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

    const release = await screen.findByRole("button", { name: /^release$/i });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");

    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

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

    const release = await screen.findByRole("button", { name: /^release$/i });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

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
          message: "The remote moved while you were deciding.",
          plan: RECOMPUTED,
        },
        status: 409,
      },
    });
    renderHarness();

    const release = await screen.findByRole("button", { name: /^release$/i });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText(/the remote moved while you were/i),
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
          message: "The remote moved while you were deciding.",
          plan: RECOMPUTED,
        },
        status: 409,
      },
    });
    renderHarness();

    const release = await screen.findByRole("button", { name: /^release$/i });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(screen.getByRole("button", { name: /^major$/i }));
    expect(await screen.findByText("v2.0.0")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

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
          message: "The remote moved while you were deciding.",
          plan: RECOMPUTED,
        },
        status: 409,
        retry: { body: { tag: "v1.3.1", revision: RECOMPUTED.revision } },
      },
      confirmations,
    });
    renderHarness();

    const release = await screen.findByRole("button", { name: /^release$/i });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    await screen.findByText("v1.3.1");

    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

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
          message: "The remote moved while you were deciding.",
        },
        status: 409,
      },
    });
    renderHarness();

    const release = await screen.findByRole("button", { name: /^release$/i });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

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
          message: "The remote moved while you were deciding.",
          plan: { ...RECOMPUTED, ...broken },
        },
        status: 409,
      },
    });
    renderHarness();

    const release = await screen.findByRole("button", { name: /^release$/i });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

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
          message: "Someone already published this version.",
        },
        status: 409,
      },
    });
    renderHarness();

    const release = await screen.findByRole("button", { name: /^release$/i });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");

    await userEvent.click(screen.getByRole("button", { name: /^publish$/i }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/already published this version/i),
    ).toBeInTheDocument();
  });

  it("reports a harness that is not connected instead of an empty screen", async () => {
    stubHarnessServer({
      read: {
        body: {
          error: "not-configured",
          message: "No harness is connected. Set the agent-harness clone path.",
        },
        status: 409,
      },
    });
    renderHarness();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no harness is connected/i,
    );
  });
});
