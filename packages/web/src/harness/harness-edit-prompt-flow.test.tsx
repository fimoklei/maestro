import type { HarnessStageRow, HarnessState } from "@maestro/core";
import type { PromptFile } from "@maestro/core/prompt-file";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery, sentence } from "../test-utils";
import {
  harnessRegion,
  openRowMenu,
  RELEASED,
  row,
  withStages,
} from "./harness-flow-fixture";
import { HarnessView } from "./harness-view";
import { pullRequest } from "./stage-row-fixture";

// Edit prompt on the Harness screen's prompt rows (#1677).

const FETCHED: HarnessState = {
  ...RELEASED,
  freshness: { outcome: "fetched", lastFetchedAt: "2026-08-03T11:56:00.000Z" },
};

const prompt = (
  stage: HarnessStageRow["stage"],
  status: HarnessStageRow["status"],
  over: Partial<HarnessStageRow> = {},
): HarnessStageRow =>
  row(stage, "pr-review", status, {
    type: "prompt",
    path: ".maestro/prompts/pr-review.md",
    branch: "maestro/prompt.pr-review",
    onDisk: true,
    ...over,
  });

const WORKING: PromptFile = {
  description: "Review a pull request.",
  text: "Review [PR LINK] for $ARGUMENTS.\n",
};

const STAGE_TITLE = {
  "pending-proposal": "Pending proposal",
  "pending-review": "Pending review",
  "pending-release": "Pending release",
} as const;

function stubServer(
  before: HarnessState,
  after: HarnessState = before,
  /** The read's refusal code, with its HTTP status. */
  readRefusal?: [string, number],
) {
  const edits: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/harness/prompt/read") {
        return readRefusal === undefined
          ? jsonResponse(WORKING)
          : jsonResponse({ error: readRefusal[0] }, readRefusal[1]);
      }
      if (url === "/api/harness/prompt/edit") {
        edits.push(JSON.parse(String(init?.body)));
        return jsonResponse({ name: "pr-review" });
      }
      if (url.startsWith("/api/harness")) {
        return jsonResponse(edits.length === 0 ? before : after);
      }
      return jsonResponse({}, 404);
    }),
  );
  return { edits };
}

const settled = async () => {
  const reread = await screen.findByRole("button", {
    name: "Re-read Harness",
  });
  await waitFor(() => expect(reread).not.toHaveAttribute("aria-busy"));
};

const render = async () => {
  renderWithQuery(<HarnessView openPrimitive={null} written={null} />);
  await settled();
};

async function menuLabels(
  stage: HarnessStageRow["stage"],
  type: "skill" | "prompt" = "prompt",
) {
  const menu = await openRowMenu("pr-review", STAGE_TITLE[stage], type);
  const labels = within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.textContent);
  await userEvent.keyboard("{Escape}");
  return labels;
}

async function openPane() {
  await userEvent.click(
    await screen.findByText("pr-review", { selector: "td *" }),
  );
  return screen.findByRole("complementary", { name: "pr-review detail" });
}

// The pane foot's buttons, in order; the ⋯ holds the danger items.
const footButtons = (pane: HTMLElement) =>
  within(pane)
    .getAllByRole("button")
    .map((button) => button.textContent)
    .filter((label) => label === "Propose change" || label === "Edit prompt");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Harness — Edit prompt", () => {
  it("offers Edit prompt after Propose change, in the ⋮ menu and the pane foot", async () => {
    stubServer(
      withStages(FETCHED, {
        proposal: [prompt("pending-proposal", "not-yet-proposed")],
      }),
    );
    await render();

    expect(await menuLabels("pending-proposal")).toEqual([
      "Propose change",
      "Edit prompt",
    ]);
    expect(footButtons(await openPane())).toEqual([
      "Propose change",
      "Edit prompt",
    ]);
  });

  it("offers Edit prompt on a Pending review row on disk, before its danger item", async () => {
    stubServer(
      withStages(FETCHED, {
        review: [
          prompt("pending-review", "waiting-for-review", {
            requests: [pullRequest(45)],
          }),
        ],
      }),
    );
    await render();

    expect(await menuLabels("pending-review")).toEqual([
      "View pull request",
      "Edit prompt",
      "Withdraw proposal",
    ]);
  });

  it("offers Edit prompt on a Pending release row on disk, before its danger item", async () => {
    stubServer(
      withStages(FETCHED, {
        release: [
          prompt("pending-release", "not-yet-released", {
            requests: [pullRequest(45)],
          }),
        ],
      }),
    );
    await render();

    expect(await menuLabels("pending-release")).toEqual([
      "View pull request",
      "Edit prompt",
      "Withdraw from release",
    ]);
  });

  it("offers no Edit prompt on a row not on disk, and keeps Restore prompt", async () => {
    stubServer(
      withStages(FETCHED, {
        proposal: [
          prompt("pending-proposal", "not-yet-proposed", {
            onDisk: false,
            change: "deletion",
            restorable: true,
          }),
        ],
      }),
    );
    await render();

    const labels = await menuLabels("pending-proposal");
    expect(labels).not.toContain("Edit prompt");
    expect(labels).toContain("Restore prompt");
  });

  it("offers no Edit prompt on a skill row on disk", async () => {
    stubServer(
      withStages(FETCHED, {
        proposal: [
          row("pending-proposal", "pr-review", "not-yet-proposed", {
            onDisk: true,
          }),
        ],
      }),
    );
    await render();

    expect(await menuLabels("pending-proposal", "skill")).not.toContain(
      "Edit prompt",
    );
  });

  it("lands back on the Harness screen with the edited row selected", async () => {
    const { edits } = stubServer(
      withStages(FETCHED, {
        proposal: [prompt("pending-proposal", "not-yet-proposed")],
      }),
    );
    await render();
    const menu = await openRowMenu("pr-review", "Pending proposal", "prompt");

    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Edit prompt" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit pr-review",
    });
    expect(
      screen.queryByRole("complementary", { name: "pr-review detail" }),
    ).not.toBeInTheDocument();
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /^Description/ }),
      " Be brief.",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^Edit prompt/ }),
    );

    await waitFor(() =>
      expect(edits).toEqual([
        {
          name: "pr-review",
          description: "Review a pull request. Be brief.",
          text: WORKING.text,
          read: WORKING,
        },
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole("complementary", { name: "pr-review detail" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(harnessRegion()).toHaveTextContent("Edited pr-review."),
    );
  });

  it("shows a prompt edited under an open pull request in Pending proposal, ready for Update proposal", async () => {
    const request = {
      ...pullRequest(45),
      headBranch: "maestro/prompt.pr-review",
    };
    stubServer(
      withStages(FETCHED, {
        review: [
          prompt("pending-review", "waiting-for-review", {
            requests: [request],
          }),
        ],
      }),
      withStages(FETCHED, {
        proposal: [
          prompt("pending-proposal", "new-local-work", { requests: [request] }),
        ],
        review: [
          prompt("pending-review", "waiting-for-review", {
            requests: [request],
          }),
        ],
      }),
    );
    await render();
    const menu = await openRowMenu("pr-review", "Pending review", "prompt");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Edit prompt" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Edit pr-review",
    });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: /^Prompt text/ }),
      "Be brief.",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^Edit prompt/ }),
    );

    const pane = await screen.findByRole("complementary", {
      name: "pr-review detail",
    });
    await waitFor(() =>
      expect(within(pane).getByText("Pending proposal")).toBeInTheDocument(),
    );
    expect(
      within(pane).getByRole("button", { name: "Update proposal" }),
    ).toBeInTheDocument();
  });

  it("states a read that finds no file in the row's pane and opens no dialog", async () => {
    const proposal = withStages(FETCHED, {
      proposal: [prompt("pending-proposal", "not-yet-proposed")],
    });
    stubServer(proposal, proposal, ["prompt-missing", 404]);
    await render();
    const menu = await openRowMenu("pr-review", "Pending proposal", "prompt");

    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Edit prompt" }),
    );

    const pane = within(
      await screen.findByRole("complementary", { name: "pr-review detail" }),
    );
    expect(
      await pane.findByText("Prompt not in your clone"),
    ).toBeInTheDocument();
    expect(
      pane.getByText(
        sentence(
          "Nothing was edited. Select Re-read Harness, then select Restore prompt.",
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("states another refused read in the Import prompt words", async () => {
    const proposal = withStages(FETCHED, {
      proposal: [prompt("pending-proposal", "not-yet-proposed")],
    });
    stubServer(proposal, proposal, ["import-in-progress", 409]);
    await render();
    const pane = within(await openPane());

    await userEvent.click(pane.getByRole("button", { name: "Edit prompt" }));

    expect(await pane.findByText("Harness busy")).toBeInTheDocument();
    expect(
      pane.getByText(
        sentence(
          "Wait for that change to finish, then select Edit prompt again.",
        ),
      ),
    ).toBeInTheDocument();
  });

  it.each(["offline", "fetch-failed"] as const)(
    "keeps Edit prompt open while the remote read is %s, as the edit writes only the clone",
    async (outcome) => {
      const unreached = withStages(
        {
          ...FETCHED,
          freshness: { outcome, lastFetchedAt: null },
        },
        { proposal: [prompt("pending-proposal", "not-yet-proposed")] },
      );
      stubServer(unreached);
      await render();
      const menu = await openRowMenu("pr-review", "Pending proposal", "prompt");

      const item = within(menu).getByRole("menuitem", { name: "Edit prompt" });
      expect(item).not.toHaveAttribute("aria-disabled", "true");
      await userEvent.click(item);
      expect(
        await screen.findByRole("dialog", { name: "Edit pr-review" }),
      ).toBeInTheDocument();
    },
  );
});
