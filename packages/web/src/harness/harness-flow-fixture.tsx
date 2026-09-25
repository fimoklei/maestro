import type { HarnessStageRow, HarnessState } from "@maestro/core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { HarnessView } from "./harness-view";
import { stageRow as row } from "./stage-row-fixture";

export { row };

export const RELEASED: HarnessState = {
  origin: "github.com/fimoklei/agent-harness",
  releasedVersion: "v0.5.0",
  defaultBranch: "main",
  releaseState: "released",
  freshness: { outcome: null, lastFetchedAt: null },
  cloneSync: "current",
  localHeadCommit: "local-head",
  stages: {
    proposal: { outcome: "read", rows: [], bound: null },
    review: { outcome: "read", rows: [], bound: null },
    release: { outcome: "read", rows: [], bound: null },
  },
};

// The state a stage's rows make, leaving the other two confirmed empty.
export const withStages = (
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

export function stubHarnessServer(options: {
  read: {
    body: unknown;
    status?: number;
    heldUntil?: Promise<void>;
    afterPublish?: unknown;
    afterPromote?: unknown;
  };
  // `retry` answers every check after the open-time one, so a test can move
  // the picture under a dialog that is already open.
  refresh?: {
    body: unknown;
    status?: number;
    rejects?: boolean;
    heldUntil?: Promise<void>;
    afterPublish?: unknown;
    retry?: { body: unknown; status?: number };
  };
  // One entry per plan request, so a test can hold the second one and read
  // what the reopened dialog shows while it is still in flight.
  plan?: {
    body: unknown;
    status?: number;
    holds?: (Promise<void> | undefined)[];
  };
  // `afterPublish` on either route is what it answers once a publish has gone
  // through. `retry` answers every call after the first.
  publish?: {
    body: unknown;
    status?: number;
    retry?: { body: unknown; status?: number };
  };
  promote?: { body: unknown; status?: number };
  promotions?: Record<string, unknown>[];
  // `retry` answers every call after the first.
  deletion?: {
    body: unknown;
    status?: number;
    retry?: { body: unknown; status?: number };
  };
  deletions?: Record<string, unknown>[];
  localDeletion?: { body: unknown; status?: number };
  localDeletions?: Record<string, unknown>[];
  restore?: { body: unknown; status?: number };
  restores?: Record<string, unknown>[];
  proposal?: { body: unknown; status?: number };
  proposals?: { action: string; body: Record<string, unknown> }[];
  confirmations?: Record<string, unknown>[];
  inventory?: {
    body?: unknown;
    status?: number;
    afterPublish?: { body?: unknown; status?: number };
  };
}) {
  const calls: string[] = [];
  let planCalls = 0;
  let publishCalls = 0;
  let deletionCalls = 0;
  let refreshCalls = 0;
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
      if (url.startsWith("/api/harness/proposal/")) {
        options.proposals?.push({
          action: url.slice("/api/harness/proposal/".length),
          body: JSON.parse(String(init?.body)),
        });
        const act = options.proposal ?? { body: { ok: true } };
        if ((act.status ?? 200) < 400) {
          promoted = true;
        }
        return jsonResponse(act.body, act.status);
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
      if (url === "/api/harness/skill/delete") {
        options.localDeletions?.push(JSON.parse(String(init?.body)));
        const gone = options.localDeletion ?? { body: {}, status: 500 };
        if ((gone.status ?? 200) < 400) {
          promoted = true;
        }
        return jsonResponse(gone.body, gone.status);
      }
      if (url === "/api/harness/skill/restore") {
        options.restores?.push(JSON.parse(String(init?.body)));
        const back = options.restore ?? { body: {}, status: 500 };
        if ((back.status ?? 200) < 400) {
          promoted = true;
        }
        return jsonResponse(back.body, back.status);
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
      if (url.startsWith("/api/inventory/primitives")) {
        const inventory = options.inventory ?? {};
        const answered =
          published && inventory.afterPublish !== undefined
            ? inventory.afterPublish
            : inventory;
        return jsonResponse(
          answered.body ?? { primitives: [] },
          answered.status,
        );
      }
      if (url.startsWith("/api/harness/refresh")) {
        const first = options.refresh ?? options.read;
        const refresh =
          refreshCalls > 0 && "retry" in first && first.retry !== undefined
            ? first.retry
            : first;
        refreshCalls += 1;
        if ("rejects" in refresh && refresh.rejects === true) {
          throw new TypeError("Failed to fetch");
        }
        await ("heldUntil" in refresh ? refresh.heldUntil : undefined);
        return jsonResponse(answer(refresh), refresh.status);
      }
      // Held by the test rather than by a timer, so the race is decided by
      // hand and not by the clock.
      await options.read.heldUntil;
      return jsonResponse(answer(options.read), options.read.status);
    }),
  );
  return calls;
}

export function renderHarness() {
  // StrictMode, because the real app mounts under it and replays every effect
  // — the open-time refresh must still be one request.
  return renderWithQuery(
    <StrictMode>
      <HarnessView />
    </StrictMode>,
  );
}

export const STAGE_TITLES = [
  "Pending proposal",
  "Pending review",
  "Pending release",
];

export const harnessGrid = () =>
  screen.findByRole("grid", { name: "Harness table" });

// A group header is a row with no id of its own that starts with a stage name;
// data rows carry the id the grid's cursor points at.
const isStageHeader = (row: HTMLElement) =>
  row.id === "" &&
  STAGE_TITLES.some((title) => (row.textContent ?? "").startsWith(title));

export async function stageHeaders(): Promise<string[]> {
  return within(await harnessGrid())
    .getAllByRole("row")
    .filter(isStageHeader)
    .map((row) => row.textContent ?? "");
}

export async function stageHeader(stage: string): Promise<HTMLElement> {
  const header = within(await harnessGrid())
    .getAllByRole("row")
    .find((row) => isStageHeader(row) && row.textContent?.startsWith(stage));
  if (header === undefined) throw new Error(`no ${stage} group`);
  return header;
}

export async function stageRows(stage: string): Promise<HTMLElement[]> {
  const rows: HTMLElement[] = [];
  let current: string | null = null;
  for (const row of within(await harnessGrid())
    .getAllByRole("row")
    .slice(1)) {
    if (isStageHeader(row)) {
      current =
        STAGE_TITLES.find((title) => row.textContent?.startsWith(title)) ??
        null;
      continue;
    }
    if (current === stage) rows.push(row);
  }
  return rows;
}

export async function openPane(skill: string, stage = "Pending proposal") {
  const row = (await stageRows(stage)).find(
    (each) => within(each).queryByText(skill) !== null,
  );
  if (row === undefined) throw new Error(`no ${skill} in ${stage}`);
  await userEvent.click(within(row).getByText(skill));
  return screen.findByRole("complementary", { name: `${skill} detail` });
}

export const ON_DISK: HarnessState = {
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

export const openRowMenu = async (
  skill: string,
  stage = "Pending proposal",
) => {
  await userEvent.click(
    await screen.findByRole("button", {
      name: `Actions for ${skill} in ${stage}`,
    }),
  );
  return screen.findByRole("menu");
};

export const promoteRow = async (skill: string) => {
  const menu = await openRowMenu(skill);
  await userEvent.click(
    within(menu).getByRole("menuitem", { name: /^propose change$/i }),
  );
};

// A fixed clock, so "4 min ago" is the same sentence on every run, and no stub
// outlives its test. Call once at the top of each file.
export function installHarnessHooks() {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-03T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
}
