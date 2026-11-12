import type { HarnessStageRow, HarnessState } from "@maestro/core";
import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { HarnessView } from "./harness-view";

const HARNESS: HarnessState = {
  origin: "github.com/fimoklei/agent-harness",
  releasedVersion: "v0.5.0",
  defaultBranch: "main",
  releaseState: "released",
  freshness: { outcome: "fetched", lastFetchedAt: "2026-08-03T11:56:00.000Z" },
  cloneSync: "current",
  localHeadCommit: "local-head",
  stages: {
    proposal: { outcome: "read", rows: [], bound: null },
    review: { outcome: "read", rows: [], bound: null },
    release: { outcome: "read", rows: [], bound: null },
  },
};

const IMPORTED_ROW: HarnessStageRow = {
  stage: "pending-proposal",
  type: "skill",
  name: "code-review",
  path: ".apm/skills/code-review",
  branch: "maestro/code-review",
  status: "not-yet-proposed",
  change: "edit",
  requests: [],
  reviewers: [],
  comparison: { kind: "default-branch" },
  alsoIn: [],
  concurrentChange: false,
  waitingOn: null,
  localOnly: false,
  remoteTree: null,
  restorable: false,
  onDisk: false,
  ownsBranch: false,
  previousName: null,
  openRequests: [],
  mergedRequest: null,
};

const IMPORTED_HARNESS: HarnessState = {
  ...HARNESS,
  stages: {
    ...HARNESS.stages,
    proposal: { outcome: "read", bound: null, rows: [IMPORTED_ROW] },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Harness import flow", () => {
  it("opens the skill Import local edits landed, as its Pending proposal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(IMPORTED_HARNESS)),
    );
    renderWithQuery(
      <HarnessView
        openPrimitive={{ type: "skill", name: "code-review" }}
        written={null}
      />,
    );

    const pane = await screen.findByRole("complementary", {
      name: "code-review detail",
    });
    expect(within(pane).getByText("Pending proposal")).toBeInTheDocument();
  });
});
