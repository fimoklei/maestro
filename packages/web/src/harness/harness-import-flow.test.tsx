import type { HarnessStageRow, HarnessState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { HarnessView } from "./harness-view";
import { pullRequest } from "./stage-row-fixture";

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
  skill: "code-review",
  status: "not-yet-proposed",
  deletion: false,
  requests: [],
  reviewers: [],
  comparison: { kind: "default-branch" },
  alsoIn: [],
  concurrentChange: false,
  localOnly: false,
  remoteTree: null,
  restorable: false,
  previousName: null,
};

const IMPORTED_HARNESS: HarnessState = {
  ...HARNESS,
  stages: {
    ...HARNESS.stages,
    proposal: { outcome: "read", bound: null, rows: [IMPORTED_ROW] },
  },
};

// The same skill holding a row in all three stages, which is what one import
// has to tell apart (#865). The two remote rows carry a request so their menus
// are pressable, and so a stray focus would land on one of them.
const REQUEST = pullRequest(45);

const remoteRow = (
  stage: "pending-review" | "pending-release",
  status: HarnessStageRow["status"],
): HarnessStageRow => ({
  ...IMPORTED_ROW,
  stage,
  status,
  comparison: null,
  requests: [REQUEST],
});

const IN_EVERY_STAGE: HarnessState = {
  ...IMPORTED_HARNESS,
  stages: {
    proposal: { outcome: "read", bound: null, rows: [IMPORTED_ROW] },
    review: {
      outcome: "read",
      bound: null,
      rows: [remoteRow("pending-review", "waiting-for-review")],
    },
    release: {
      outcome: "read",
      bound: null,
      rows: [remoteRow("pending-release", "changed")],
    },
  },
};

const SOURCE = "/home/me/Code Review";

const CLEAN_CHECK = {
  name: "code-review",
  sourceBlocker: null,
  nameBlocker: null,
  advisories: [] as string[],
};

// One stub for the four routes this flow touches: the harness read, the
// folder chooser, the import check, and the import itself.
function stubImportServer(options: {
  check?: unknown;
  importStatus?: number;
  importBody?: unknown;
  // What the harness read answers once the import has gone through.
  imported?: HarnessState;
}) {
  const calls: string[] = [];
  const imports: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      // The system folder chooser answers Browse with the skill folder.
      if (url === "/api/folder-chooser") {
        return jsonResponse(
          init?.method === "POST" ? { path: SOURCE } : { available: true },
        );
      }
      if (url === "/api/harness/import/check") {
        return jsonResponse(options.check ?? CLEAN_CHECK);
      }
      if (url === "/api/harness/import") {
        imports.push(JSON.parse(String(init?.body)));
        return jsonResponse(
          options.importBody ?? { name: "code-review", skipped: 3 },
          options.importStatus,
        );
      }
      // The imported skill is a row of Pending proposal from the next read on.
      return jsonResponse(
        imports.length === 0 ? HARNESS : (options.imported ?? IMPORTED_HARNESS),
      );
    }),
  );
  return { calls, imports };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Picks the skill folder through Browse, which the stubbed chooser answers,
// and waits for the check's proposal to fill the name.
async function openImportWithSource(user: ReturnType<typeof userEvent.setup>) {
  // Band 1's, first; an empty Harness repeats it in its empty state.
  const [importSkill] = await screen.findAllByRole("button", {
    name: "Import skill…",
  });
  await user.click(importSkill as HTMLElement);
  await user.click(await screen.findByRole("button", { name: "Browse" }));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Folder path" })).toHaveValue(
      SOURCE,
    ),
  );
}

describe("Harness import flow", () => {
  it("imports the picked folder under the proposed name and rereads the harness", async () => {
    const { calls, imports } = stubImportServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView />);

    await openImportWithSource(user);
    expect(await screen.findByLabelText(/name in the harness/i)).toHaveValue(
      "code-review",
    );
    await user.click(screen.getByRole("button", { name: "Import skill" }));

    await waitFor(() => {
      expect(imports).toEqual([{ source: SOURCE, name: "code-review" }]);
    });
    // The dialog stays open and states what landed, including what the copy
    // left behind; the harness read is asked again for the new movement.
    expect(await screen.findByText("Skill imported")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The skill was imported into the Harness. Select View in Harness to find it.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "3 entries were skipped: .git and operating-system files.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        calls.filter((call) => call === "GET /api/harness").length,
      ).toBeGreaterThan(1);
    });
  });

  it("states a name clash on the name field and closes Import", async () => {
    stubImportServer({
      check: { ...CLEAN_CHECK, nameBlocker: "name-taken" },
    });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView />);

    await openImportWithSource(user);

    const field = await screen.findByLabelText(/name in the harness/i);
    expect(field).toHaveAccessibleDescription(
      /already holds a skill under it/i,
    );
    expect(screen.getByRole("button", { name: "Import skill" })).toBeDisabled();
  });

  it("reports the conventions without closing Import", async () => {
    stubImportServer({
      check: { ...CLEAN_CHECK, advisories: ["long-manifest"] },
    });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView />);

    await openImportWithSource(user);

    expect(
      await screen.findByText("SKILL.md is over 500 lines."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import skill" })).toBeEnabled();
  });

  it("sends the author from the confirmation to the imported row", async () => {
    stubImportServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView />);

    await openImportWithSource(user);
    await user.click(screen.getByRole("button", { name: "Import skill" }));
    await user.click(
      await screen.findByRole("button", { name: "View in Harness" }),
    );

    // The dialog is gone, and the row it sent the author to is open in its
    // pane, which holds the keyboard (#846).
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const pane = await screen.findByRole("complementary", {
      name: "code-review detail",
    });
    await waitFor(() =>
      expect(
        within(pane).getByRole("heading", { level: 2, name: "code-review" }),
      ).toHaveFocus(),
    );
  });

  it("sends the author to one row of a skill that holds all three stages", async () => {
    // The import landed in Pending proposal, so that is the row the pane
    // opens on — never a later-mounted twin (#865).
    stubImportServer({ imported: IN_EVERY_STAGE });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView />);

    await openImportWithSource(user);
    await user.click(screen.getByRole("button", { name: "Import skill" }));
    await user.click(
      await screen.findByRole("button", { name: "View in Harness" }),
    );

    const pane = await screen.findByRole("complementary", {
      name: "code-review detail",
    });
    expect(within(pane).getByText("Pending proposal")).toBeInTheDocument();
    const current = document.querySelectorAll('tr[aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Not yet proposed");
  });

  it("checks a typed folder once the author leaves the field", async () => {
    const { calls } = stubImportServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView />);

    const [importSkill] = await screen.findAllByRole("button", {
      name: "Import skill…",
    });
    await user.click(importSkill as HTMLElement);
    await user.type(
      await screen.findByRole("textbox", { name: "Folder path" }),
      SOURCE,
    );
    expect(
      calls.filter((call) => call.endsWith("/api/harness/import/check")),
    ).toHaveLength(0);
    await user.tab();

    expect(await screen.findByLabelText(/name in the harness/i)).toHaveValue(
      "code-review",
    );
  });

  it("asks again with the typed name", async () => {
    const { calls } = stubImportServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView />);

    await openImportWithSource(user);
    const field = await screen.findByLabelText(/name in the harness/i);
    await user.clear(field);
    await user.type(field, "reviewer");

    await waitFor(() => {
      expect(field).toHaveValue("reviewer");
    });
    expect(
      calls.filter((call) => call.endsWith("/api/harness/import/check")).length,
    ).toBeGreaterThan(1);
  });
});
