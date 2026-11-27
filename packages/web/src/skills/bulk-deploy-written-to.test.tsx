import type { BulkDeployReport, ReportSkill, WriteReport } from "@maestro/core";
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

// A Global deploy's Report opens with the folders it wrote (#1805).

afterEach(() => {
  vi.unstubAllGlobals();
});

const written = (name: string): ReportSkill => ({ name, state: "written" });

const outcome = (
  claude: ReportSkill[],
  codex: ReportSkill[] | null,
): WriteReport => ({
  release: "v1.0.0",
  places: [
    {
      tool: "claude",
      path: "~/.claude/skills",
      detected: true,
      skills: claude,
    },
    {
      tool: "codex",
      path: "~/.agents/skills",
      detected: codex !== null,
      skills: codex ?? [],
    },
  ],
});

const BOTH_WRITTEN = outcome(
  [written("code-review"), written("commit-message")],
  [written("code-review"), written("commit-message")],
);

// One install wrote commit-message to the Claude Code folder only.
const ONE_SHORT: BulkDeployReport = {
  target: { kind: "global" },
  deployed: [{ name: "code-review", version: "v1.0.0" }],
  attention: [],
  failed: [{ error: "deploy-incomplete", names: ["commit-message"] }],
  unfinished: true,
  report: outcome(
    [written("code-review"), written("commit-message")],
    [written("code-review"), { name: "commit-message", state: "missing" }],
  ),
};

function stub(
  report: BulkDeployReport,
  retry: () => Response = () =>
    jsonResponse({
      completed: {
        kind: "deploy",
        release: "v1.0.0",
        desired: ["code-review", "commit-message"],
      },
      report: BOTH_WRITTEN,
    }),
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/deploy-state/global")) {
        return jsonResponse(globalAnswer({ claude: [], codex: [] }));
      }
      if (url.startsWith("/api/drift/global")) {
        return jsonResponse({ behind: [] });
      }
      if (url === "/api/deploy/bulk") return jsonResponse(report);
      if (url === "/api/deploy/retry") return retry();
      if (url === "/api/deploy") {
        return jsonResponse({
          deployed: {
            type: "skill",
            name: "commit-message",
            version: "v1.0.0",
          },
          report: BOTH_WRITTEN,
        });
      }
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

const writtenTo = (dialog: HTMLElement) =>
  within(dialog).getByRole("group", { name: "Written to" });

const lines = (dialog: HTMLElement) =>
  within(writtenTo(dialog))
    .getAllByRole("listitem")
    .map((line) => line.textContent);

describe("Global deploy Report: Written to", () => {
  it("counts the skills each folder got, with no fold and no retry", async () => {
    stub({
      target: { kind: "global" },
      deployed: [
        { name: "code-review", version: "v1.0.0" },
        { name: "commit-message", version: "v1.0.0" },
      ],
      attention: [],
      failed: [],
      report: BOTH_WRITTEN,
    });

    const dialog = await deployToGlobal();

    expect(lines(dialog)).toEqual([
      "✓~/.claude/skills2 skills deployed",
      "✓~/.agents/skills2 skills deployed",
    ]);
    expect(
      within(writtenTo(dialog)).queryByRole("button"),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Retry deploy" }),
    ).not.toBeInTheDocument();
  });

  it("never counts a skill the deploy refused as deployed, though its copy sits in the folder", async () => {
    const refused: ReportSkill = {
      name: "code-review",
      state: "refused",
      reason: "local-diverged-from-tag",
    };
    stub({
      target: { kind: "global" },
      deployed: [{ name: "commit-message", version: "v1.0.0" }],
      attention: [],
      failed: [{ error: "local-diverged-from-tag", names: ["code-review"] }],
      report: outcome(
        [refused, written("commit-message")],
        [refused, written("commit-message")],
      ),
    });

    const dialog = await deployToGlobal();

    expect(lines(dialog)).toEqual([
      "✕~/.claude/skills1 of 2 skills deployedNot writtencode-review",
      "✕~/.agents/skills1 of 2 skills deployedNot writtencode-review",
    ]);
  });

  it("names the undetected tool of a folder the deploy skipped", async () => {
    stub({
      target: { kind: "global" },
      deployed: [
        { name: "code-review", version: "v1.0.0" },
        { name: "commit-message", version: "v1.0.0" },
      ],
      attention: [],
      failed: [],
      report: outcome(
        [written("code-review"), written("commit-message")],
        null,
      ),
    });

    const dialog = await deployToGlobal();

    expect(lines(dialog)).toEqual([
      "✓~/.claude/skills2 skills deployed",
      "–~/.agents/skillsCodex not detected · not written",
    ]);
  });

  it("folds a short folder open to its missing skill, with Retry deploy in the footer", async () => {
    stub(ONE_SHORT);

    const dialog = await deployToGlobal();

    expect(within(dialog).getByRole("heading", { level: 3 })).toHaveTextContent(
      "Deployed 1 of 2 skills to Global",
    );
    const fold = within(writtenTo(dialog)).getByRole("button", {
      name: /~\/\.agents\/skills/,
    });
    expect(fold).toHaveAttribute("aria-expanded", "true");
    expect(fold).toHaveTextContent("1 of 2 skills missing");
    expect(writtenTo(dialog)).toHaveTextContent("Missingcommit-message");
    expect(writtenTo(dialog)).toHaveTextContent(
      "Retry the deploy to run it again.",
    );
    expect(dialog).not.toHaveTextContent(
      "Some deployed skills are missing from the target.",
    );
    expect(
      within(dialog)
        .getAllByRole("heading", { level: 4 })
        .map((group) => group.textContent),
    ).toEqual(["✓Deployed · 1"]);
    const footer = within(dialog).getByRole("button", { name: "Retry deploy" });
    expect(footer).toBeVisible();

    await userEvent.click(fold);

    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(
      within(writtenTo(dialog)).getByText("commit-message"),
    ).not.toBeVisible();
  });

  it("retries the unfinished deploy and reads the folders it then wrote", async () => {
    stub(ONE_SHORT);
    const dialog = await deployToGlobal();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Retry deploy" }),
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
    expect(
      within(dialog).queryByRole("button", { name: "Retry deploy" }),
    ).not.toBeInTheDocument();
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === "/api/deploy/retry",
    ) as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      target: { kind: "global" },
    });
  });

  it("reads the folders again after a row's own Deploy again", async () => {
    stub({
      target: { kind: "global" },
      deployed: [{ name: "code-review", version: "v1.0.0" }],
      attention: [
        {
          name: "commit-message",
          error: "deployed-diverged-from-lock",
          forceable: true,
          copyReceipt: "b".repeat(64),
        },
      ],
      failed: [],
      report: outcome(
        [written("code-review"), written("commit-message")],
        [
          written("code-review"),
          { name: "commit-message", state: "not-updated", stillAt: "v0.9.0" },
        ],
      ),
    });
    const dialog = await deployToGlobal();

    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Deploy commit-message again",
      }),
    );

    await waitFor(() =>
      expect(lines(dialog)).toEqual([
        "✓~/.claude/skills2 skills deployed",
        "✓~/.agents/skills2 skills deployed",
      ]),
    );
  });

  it("states a failed retry above the footer and keeps Retry deploy", async () => {
    stub(ONE_SHORT, () =>
      jsonResponse({ error: "retry-incomplete", message: "irrelevant" }, 502),
    );
    const dialog = await deployToGlobal();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Retry deploy" }),
    );

    expect(await within(dialog).findByRole("alert")).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Retry deploy" }),
    ).toBeVisible();
  });
});
