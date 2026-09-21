import type { HarnessStageRow, HarnessState } from "@maestro/core";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const REQUEST = {
  number: 45,
  url: "https://github.com/fimoklei/agent-harness/pull/45",
};

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
// picker's directory listing, the import check, and the import itself.
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
      if (url === "/api/filesystem/children") {
        // Stepping into the skill folder is what picks it: the confirm button
        // takes the folder being listed.
        const asked = JSON.parse(String(init?.body)) as { path: string };
        return jsonResponse(
          asked.path === SOURCE
            ? {
                path: SOURCE,
                parent: "/home/me",
                breadcrumbs: [
                  { name: "~", path: "/home/me" },
                  { name: "Code Review", path: SOURCE },
                ],
                entries: [],
              }
            : {
                path: "/home/me",
                breadcrumbs: [{ name: "~", path: "/home/me" }],
                entries: [
                  {
                    name: "Code Review",
                    path: SOURCE,
                    facts: { isGitRepo: false, hasApmManifest: false },
                  },
                ],
              },
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

beforeEach(() => {
  // The picker remembers the last folder per mode; each test starts at home.
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Picks the one folder the stubbed listing offers and lands back on the import
// dialog with the proposal filled in.
async function openImportWithSource(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Import skill…" }),
  );
  await user.click(await screen.findByRole("button", { name: "Pick folder" }));
  await user.click(await screen.findByRole("button", { name: "Code Review" }));
  await user.click(
    await screen.findByRole("button", { name: /import this folder/i }),
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

    // The dialog is gone, and the row it sent the author to holds the keyboard
    // and is painted on the active surface.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const menu = await screen.findByRole("button", {
      name: "Actions for code-review in Pending proposal",
    });
    await waitFor(() => {
      expect(menu).toHaveFocus();
    });
    expect(menu.closest("tr")).toHaveClass("bg-active");
  });

  it("sends the author to one row of a skill that holds all three stages", async () => {
    // The import landed in Pending proposal, so that is the row the keyboard
    // and the active surface belong to — never a later-mounted twin (#865).
    stubImportServer({ imported: IN_EVERY_STAGE });
    const user = userEvent.setup();
    renderWithQuery(<HarnessView />);

    await openImportWithSource(user);
    await user.click(screen.getByRole("button", { name: "Import skill" }));
    await user.click(
      await screen.findByRole("button", { name: "View in Harness" }),
    );

    const menu = await screen.findByRole("button", {
      name: "Actions for code-review in Pending proposal",
    });
    await waitFor(() => {
      expect(menu).toHaveFocus();
    });
    expect(document.querySelectorAll("tr.bg-active")).toHaveLength(1);
    expect(menu.closest("tr")).toHaveClass("bg-active");
  });

  it("returns the imported row to normal after about three seconds", async () => {
    stubImportServer({});
    const user = userEvent.setup();
    renderWithQuery(<HarnessView />);

    await openImportWithSource(user);
    await user.click(screen.getByRole("button", { name: "Import skill" }));
    // Behind the dialog that is still open, so hidden from the a11y tree.
    const menu = await screen.findByRole("button", {
      name: "Actions for code-review in Pending proposal",
      hidden: true,
    });

    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole("button", { name: "View in Harness" }));
      expect(menu.closest("tr")).toHaveClass("bg-active");
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(menu.closest("tr")).not.toHaveClass("bg-active");
    } finally {
      vi.useRealTimers();
    }
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
