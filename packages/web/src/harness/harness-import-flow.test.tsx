import type { HarnessState } from "@maestro/core";
import { screen, waitFor } from "@testing-library/react";
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
  stages: {
    proposal: { outcome: "read", rows: [], bound: null },
    review: { outcome: "read", rows: [], bound: null },
    release: { outcome: "read", rows: [], bound: null },
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
      return jsonResponse(HARNESS);
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
    expect(
      await screen.findByText(
        /landed in the Harness and is waiting for review/i,
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/3 \.git entries were skipped/i),
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
