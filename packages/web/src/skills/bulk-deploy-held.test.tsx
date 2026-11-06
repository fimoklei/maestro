import type { BulkDeployReport, SkillOutcome } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { globalAnswer } from "../deploy-state/deploy-state-test-helpers";
import {
  chooseDeployTarget,
  jsonResponse,
  renderWithQuery,
} from "../test-utils";
import { BulkDeployAction } from "./bulk-deploy-action";

// A Global deploy held by local edits on an already-deployed skill (#1806).

afterEach(() => {
  vi.unstubAllGlobals();
});

const RECEIPTS = {
  "code-review": "a".repeat(64),
  "commit-message": "b".repeat(64),
};

const heldRow = (name: "code-review" | "commit-message") => ({
  name,
  error: "deployed-diverged-from-lock" as const,
  forceable: true,
  copyReceipt: RECEIPTS[name],
  blockingCopies: [
    {
      name: "commit-message",
      verdict: "local-edits" as const,
      folders: ["~/.claude/skills"],
    },
  ],
});

const HELD: BulkDeployReport = {
  target: { kind: "global" },
  deployed: [],
  attention: [heldRow("code-review"), heldRow("commit-message")],
  failed: [],
};

const written = (name: string): SkillOutcome => ({ name, outcome: "written" });
const both = [written("code-review"), written("commit-message")];

const DEPLOYED_AGAIN: BulkDeployReport = {
  target: { kind: "global" },
  deployed: [
    { name: "code-review", version: "v1.0.0" },
    { name: "commit-message", version: "v1.0.0" },
  ],
  attention: [],
  failed: [],
  outcome: {
    release: "v1.0.0",
    folders: [
      { path: "~/.claude/skills", tool: "claude", written: true, skills: both },
      { path: "~/.agents/skills", tool: "codex", written: true, skills: both },
    ],
  },
};

function stub(
  again: BulkDeployReport,
  run: { held: BulkDeployReport; current: string[] } = {
    held: HELD,
    current: [],
  },
) {
  // A skill in `current` is at the release in both folders: the plan skips it.
  const copies = run.current.map((name) => ({
    type: "skill",
    name,
    version: "v1.0.0",
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy-state/global")) {
        return jsonResponse(globalAnswer({ claude: copies, codex: copies }));
      }
      if (url.startsWith("/api/drift/global")) {
        return jsonResponse({ behind: [] });
      }
      if (url === "/api/deploy/bulk") return jsonResponse(run.held);
      if (url === "/api/deploy/again") return jsonResponse(again);
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
}

async function deployToGlobal() {
  renderWithQuery(
    <BulkDeployAction
      stagedNames={["code-review", "commit-message"]}
      repos={[]}
      registryReady
      onSelectionSpent={() => {}}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Deploy skills" }));
  const dialog = screen.getByRole("dialog");
  await chooseDeployTarget(dialog, /^Global/);
  const run = await waitFor(() => {
    const button = within(dialog).getByRole("button", {
      name: "Deploy skills",
    });
    expect(button).not.toHaveAttribute("aria-disabled");
    return button;
  });
  await userEvent.click(run);
  await within(dialog).findByRole("heading", { level: 3 });
  return dialog;
}

const lines = (dialog: HTMLElement) =>
  within(within(dialog).getByRole("group", { name: "Written to" }))
    .getAllByRole("listitem")
    .map((line) => line.textContent);

describe("Global deploy Report: held by local edits", () => {
  it("states that nothing was written, why, and the one way out", async () => {
    stub(DEPLOYED_AGAIN);

    const dialog = await deployToGlobal();

    expect(within(dialog).getByRole("heading", { level: 3 })).toHaveTextContent(
      "Deployed 0 of 2 skills to Global",
    );
    expect(lines(dialog)).toEqual([
      "–~/.claude/skills0 of 2 skills deployed",
      "–~/.agents/skills0 of 2 skills deployed",
    ]);
    const block = within(dialog).getByRole("alert");
    expect(block).toHaveTextContent(
      "Local edits" +
        "Nothing was deployed, because commit-message has local edits." +
        "Select Deploy again to replace those edits with the latest release and deploy both skills." +
        "Global skills deploy together, so local edits to commit-message also prevented code-review from being deployed.",
    );
    expect(within(dialog).queryAllByRole("heading", { level: 4 })).toHaveLength(
      0,
    );
    expect(
      within(dialog).getAllByRole("button", { name: /again/ }),
    ).toHaveLength(1);
    expect(
      within(dialog).getByRole("button", { name: "Deploy again" }),
    ).toBeVisible();
  });

  it("deploys every held skill under each held row's receipt in one action", async () => {
    stub(DEPLOYED_AGAIN);
    const dialog = await deployToGlobal();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Deploy again" }),
    );

    await waitFor(() =>
      expect(lines(dialog)).toEqual([
        "✓~/.claude/skills2 skills deployed",
        "✓~/.agents/skills2 skills deployed",
      ]),
    );
    expect(within(dialog).getByRole("heading", { level: 3 })).toHaveTextContent(
      "Deployed 2 of 2 skills to Global",
    );
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Deploy again" }),
    ).not.toBeInTheDocument();
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === "/api/deploy/again",
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      target: { kind: "global" },
      held: [
        { name: "code-review", confirmedCopyReceipt: RECEIPTS["code-review"] },
        {
          name: "commit-message",
          confirmedCopyReceipt: RECEIPTS["commit-message"],
        },
      ],
    });
  });

  it("counts the skipped skill whose edits held the run in each folder once Deploy again ran", async () => {
    // The install rewrites the whole Selection, so the folders are read over it.
    stub(
      {
        ...DEPLOYED_AGAIN,
        deployed: [{ name: "code-review", version: "v1.0.0" }],
      },
      {
        held: { ...HELD, attention: [heldRow("code-review")] },
        current: ["commit-message"],
      },
    );
    const dialog = await deployToGlobal();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Deploy again" }),
    );

    await waitFor(() =>
      expect(
        within(dialog).getByRole("heading", { level: 3 }),
      ).toHaveTextContent("Deployed 2 of 2 skills to Global"),
    );
    expect(lines(dialog)).toEqual([
      "✓~/.claude/skills2 skills deployed",
      "✓~/.agents/skills2 skills deployed",
    ]);
  });
});
