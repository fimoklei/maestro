import type { HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { useInventory } from "../inventory/use-inventory";
import { renderWithQuery } from "../test-utils";
import {
  installHarnessHooks,
  RELEASED,
  renderHarness,
  stubHarnessServer,
} from "./harness-flow-fixture";
import { HarnessView } from "./harness-view";

// Holds the Inventory query open beside the Harness view, so a test can state
// whether publishing a release made it read again.
function InventoryProbe() {
  useInventory();
  return null;
}

// The same query, held but not asked for: a screen that gates its read behind a
// source has an entry in the cache that nothing is refetching.
function IdleInventoryProbe() {
  useInventory({ enabled: false });
  return null;
}

installHarnessHooks();

describe("Harness release", () => {
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
        screen.getByRole("button", { name: /^create a release$/i }),
      ).toBeDisabled(),
    );
  });

  it("opens a consequences-first plan when the author asks to release", async () => {
    stubHarnessServer({ read: { body: FETCHED }, plan: { body: PLAN } });
    renderHarness();

    const release = await screen.findByRole("button", {
      name: /^create a release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("v1.3.0")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Suggested: v1\.3\.0\. A skill was added\./),
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
      name: /^create a release$/i,
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
      name: /^create a release$/i,
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
      name: /^create a release$/i,
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

  it("re-reads the Inventory once the release is published", async () => {
    const calls = stubHarnessServer({
      read: { body: FETCHED },
      refresh: {
        body: FETCHED,
        afterPublish: { ...RELEASED, releasedVersion: "v1.3.0" },
      },
      plan: { body: PLAN },
      publish: { body: { tag: "v1.3.0", revision: PLAN.revision } },
    });
    renderWithQuery(
      <StrictMode>
        <HarnessView />
        <InventoryProbe />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(
        calls.filter((call) => call.includes("/api/inventory/primitives")),
      ).toHaveLength(1),
    );

    const release = await screen.findByRole("button", {
      name: /^create a release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    await waitFor(() =>
      expect(
        calls.filter((call) => call.includes("/api/inventory/primitives")),
      ).toHaveLength(2),
    );
  });

  it("states the published tag and the Inventory read that followed it", async () => {
    stubHarnessServer({
      read: { body: FETCHED },
      refresh: {
        body: FETCHED,
        afterPublish: { ...RELEASED, releasedVersion: "v1.3.0" },
      },
      plan: { body: PLAN },
      publish: { body: { tag: "v1.3.0", revision: PLAN.revision } },
    });
    renderWithQuery(
      <StrictMode>
        <HarnessView />
        <InventoryProbe />
      </StrictMode>,
    );

    const release = await screen.findByRole("button", {
      name: /^create a release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    // The dialog closes on success: the outcome is stated on the screen it
    // was published from, and the dialog holds no result state (#849).
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Release published")).toBeInTheDocument();
    expect(
      screen.getByText("Maestro tagged v1.3.0 and refreshed Inventory."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A release cannot change after publication."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /re-read inventory/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the publication honest when the Inventory read afterwards failed", async () => {
    // The tag is atomic, so a refused re-read leaves half an outcome: the
    // release stands and the Inventory does not show it yet (#849).
    const calls = stubHarnessServer({
      read: { body: FETCHED },
      refresh: {
        body: FETCHED,
        afterPublish: { ...RELEASED, releasedVersion: "v1.3.0" },
      },
      plan: { body: PLAN },
      publish: { body: { tag: "v1.3.0", revision: PLAN.revision } },
      inventory: { afterPublish: { body: {}, status: 500 } },
    });
    renderWithQuery(
      <StrictMode>
        <HarnessView />
        <InventoryProbe />
      </StrictMode>,
    );
    await waitFor(() =>
      expect(
        calls.filter((call) => call.includes("/api/inventory/primitives")),
      ).toHaveLength(1),
    );

    const release = await screen.findByRole("button", {
      name: /^create a release$/i,
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
    expect(await screen.findByText("Release published")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Maestro tagged v1.3.0 but could not refresh Inventory. Re-read Inventory to see the published skills.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A release cannot change after publication."),
    ).toBeInTheDocument();

    // The action is the way back: it reads the Inventory again.
    await userEvent.click(
      screen.getByRole("button", { name: /^re-read inventory$/i }),
    );
    await waitFor(() =>
      expect(
        calls.filter((call) => call.includes("/api/inventory/primitives")),
      ).toHaveLength(3),
    );
  });

  // Nothing is holding the Inventory open, so there is no query to invalidate.
  // The publication still has to read it, or "refreshed Inventory" states a
  // read that never happened (#849).
  it("reads the Inventory when no screen is holding it open", async () => {
    const calls = stubHarnessServer({
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
      name: /^create a release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    await waitFor(() =>
      expect(
        calls.filter((call) => call.includes("/api/inventory/primitives")),
      ).toHaveLength(1),
    );
    expect(
      await screen.findByText("Maestro tagged v1.3.0 and refreshed Inventory."),
    ).toBeInTheDocument();
  });

  it("keeps the publication honest when an unheld Inventory read failed", async () => {
    stubHarnessServer({
      read: { body: FETCHED },
      refresh: {
        body: FETCHED,
        afterPublish: { ...RELEASED, releasedVersion: "v1.3.0" },
      },
      plan: { body: PLAN },
      publish: { body: { tag: "v1.3.0", revision: PLAN.revision } },
      inventory: { afterPublish: { body: {}, status: 500 } },
    });
    renderWithQuery(
      <StrictMode>
        <HarnessView />
        <IdleInventoryProbe />
      </StrictMode>,
    );

    const release = await screen.findByRole("button", {
      name: /^create a release$/i,
    });
    await waitFor(() => expect(release).toBeEnabled());
    await userEvent.click(release);
    await screen.findByText("v1.3.0");
    await userEvent.click(
      screen.getByRole("button", { name: /^publish release$/i }),
    );

    expect(
      await screen.findByText(
        "Maestro tagged v1.3.0 but could not refresh Inventory. Re-read Inventory to see the published skills.",
      ),
    ).toBeInTheDocument();
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
      name: /^create a release$/i,
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
      name: /^create a release$/i,
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
      name: /^create a release$/i,
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
      name: /^create a release$/i,
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
      name: /^create a release$/i,
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
      name: /^create a release$/i,
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
      name: /^create a release$/i,
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
      name: /^create a release$/i,
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
});
