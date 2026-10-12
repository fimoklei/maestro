import type { ToolDeployState } from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRereadInventory } from "../shell/use-reread-inventory";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { InventoryPanel } from "./inventory-panel";

// Drops the cached read the way the Harness location screen's own button does,
// so the panel is asked to render a failure over content it already showed.
function RereadTrigger() {
  const reread = useRereadInventory();
  return (
    <button type="button" onClick={reread}>
      Force re-read
    </button>
  );
}

// Opens the detail pane, where Deploy lives, and returns its scope.
async function openPane(name: string) {
  await userEvent.click(await screen.findByRole("gridcell", { name }));
  return within(await screen.findByRole("complementary"));
}

// The pane's Deploy skill opens the deploy dialog with this skill alone, where
// the target is chosen (#1065). Returns the dialog's scope.
async function openDeployDialog(name: string) {
  const pane = await openPane(name);
  await userEvent.click(pane.getByRole("button", { name: "Deploy skill" }));
  return within(await screen.findByRole("dialog", { name: "Deploy 1 skill" }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Band 2's value beside a fact's label.
const factValue = (label: string) =>
  screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
const skillsFact = () => factValue("Skills");

function renderPanel() {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/inventory"]}>
      <InventoryPanel />
    </MemoryRouter>,
  );
}

// The Harness reads Delete skill waits on, answered as on a computer with no
// Working Harness (#1385).
const withoutHarness = (input: RequestInfo | URL): Response | null =>
  String(input).startsWith("/api/harness")
    ? jsonResponse({ error: "not-configured" }, 409)
    : null;

// Routes by URL: inventory, registry (deploy repo choice), and each target's
// deploy-state (deployed-column roll-up). Returns the real shape with `skipped`.
function stubApi(primitives: unknown[], repos: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/registry")) {
        return jsonResponse({ repos }, 200);
      }
      if (url.startsWith("/api/deploy-state")) {
        return jsonResponse({ primitives: [], skipped: [] }, 200);
      }
      return withoutHarness(input) ?? jsonResponse({ primitives }, 200);
    }),
  );
}

describe("InventoryPanel", () => {
  it("titles the page with a single h1", async () => {
    // Heading navigation has no starting point without one.
    stubApi([{ type: "skill", name: "tdd", description: "TDD loop" }], []);
    renderPanel();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: /^skills$/i,
      }),
    ).toBeInTheDocument();
  });

  it("lists every central skill with its name and description", async () => {
    stubApi(
      [
        { type: "skill", name: "tdd", description: "TDD loop" },
        { type: "skill", name: "diagnose", description: "Diagnosis loop" },
      ],
      [],
    );
    renderPanel();

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(screen.getByText("TDD loop")).toBeInTheDocument();
    expect(screen.getByText("diagnose")).toBeInTheDocument();
    expect(screen.getByText("Diagnosis loop")).toBeInTheDocument();
  });

  it("exposes the skills as a table, one row per skill", async () => {
    // A real table keeps table semantics for assistive tech (#80, #285).
    stubApi(
      [
        { type: "skill", name: "tdd", description: "TDD loop" },
        { type: "skill", name: "diagnose", description: "Diagnosis loop" },
      ],
      [],
    );
    renderPanel();

    await screen.findByText("tdd");
    const grid = screen.getByRole("grid", { name: "Skills table" });
    expect(within(grid).getAllByRole("row")).toHaveLength(3); // header + 2 skills
  });

  it("offers a deploy action with a repo choice from the detail pane", async () => {
    stubApi(
      [{ type: "skill", name: "tdd", description: "TDD loop" }],
      [{ path: "/projects/alpha" }],
    );
    renderPanel();

    const dialog = await openDeployDialog("tdd");

    expect(
      await dialog.findByRole("button", {
        name: "Deploy skill — no target",
      }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(dialog.getByRole("combobox", { name: "Target" }));
    await userEvent.click(await screen.findByRole("option", { name: /alpha/ }));
    expect(
      await dialog.findByRole("button", { name: "Deploy skill" }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("disables the deploy action while the registry is still loading", async () => {
    // Inventory resolves, registry never does: the button must wait for the
    // registry instead of treating "not loaded yet" as "no repos" (#37).
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: RequestInfo | URL) =>
          withoutHarness(input) ??
          (String(input).startsWith("/api/registry")
            ? new Promise<Response>(() => undefined)
            : jsonResponse(
                {
                  primitives: [
                    { type: "skill", name: "tdd", description: "TDD loop" },
                  ],
                },
                200,
              )),
      ),
    );
    renderPanel();

    const dialog = await openDeployDialog("tdd");

    expect(
      await dialog.findByRole("button", { name: /targets still loading/ }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("holds the status unresolved while the registry is still loading", async () => {
    // The repo set is unknown until the registry resolves, so the row must not
    // read a definite "Not deployed", and no status shows before the server
    // confirms it.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: RequestInfo | URL) =>
          withoutHarness(input) ??
          (String(input).startsWith("/api/registry")
            ? new Promise<Response>(() => undefined)
            : jsonResponse(
                {
                  primitives: [
                    { type: "skill", name: "tdd", description: "TDD loop" },
                  ],
                },
                200,
              )),
      ),
    );
    renderPanel();

    await screen.findByText("tdd");
    expect(screen.queryByText("Not deployed")).not.toBeInTheDocument();
    expect(screen.queryByText("Up to date")).not.toBeInTheDocument();
  });

  it("disables the deploy action when the registry failed to load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (input: RequestInfo | URL) =>
          withoutHarness(input) ??
          (String(input).startsWith("/api/registry")
            ? jsonResponse({ message: "boom" }, 500)
            : jsonResponse(
                {
                  primitives: [
                    { type: "skill", name: "tdd", description: "TDD loop" },
                  ],
                },
                200,
              )),
      ),
    );
    renderPanel();

    const dialog = await openDeployDialog("tdd");

    expect(
      await dialog.findByRole("button", { name: /targets still loading/ }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("shows an actionable message when the inventory is not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: "not-configured", message: "irrelevant" }, 409),
      ),
    );
    renderPanel();

    // A panel that failed to load announces politely: nothing followed a click (#465).
    const notice = (await screen.findByText("No Harness connected")).closest(
      '[role="status"]',
    );
    expect(notice).not.toBeNull();
    // The Harness screen's own words for the same refusal.
    expect(notice).toHaveTextContent(
      /^✕No Harness connectedSelect Change Harness location in Settings\.Re-read Skills$/,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers the Harness from the empty state when nothing is released", async () => {
    stubApi([], []);
    renderPanel();

    expect(
      await screen.findByText("No released skills yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Skills from the latest release appear here."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Harness" }),
    ).toBeInTheDocument();
  });

  it("shows the read failure with its own recovery when the release cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "unreadable" }, 503)),
    );
    renderPanel();

    const notice = (
      await screen.findByText("Inventory not read")
    ).closest<HTMLElement>('[role="status"]');
    if (notice === null) throw new Error("the notice is not a status region");
    expect(notice).toHaveTextContent("Select Re-read Skills to try again.");
    expect(
      within(notice).getByRole("button", { name: "Re-read Skills" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a generic load error for other failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "boom" }, 500)),
    );
    renderPanel();

    expect(
      (await screen.findByText(/Inventory not read/i)).closest(
        '[role="status"]',
      ),
    ).not.toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // A failed read keeps the previous rows and recovers in place; this reverses #841.
  it("keeps the rows and the count under a failed re-read, and recovers in place", async () => {
    let fail = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/registry")) return jsonResponse({ repos: [] });
        const harness = withoutHarness(input);
        if (harness !== null) return harness;
        if (url.startsWith("/api/deploy-state"))
          return jsonResponse({ primitives: [], skipped: [] });
        return fail
          ? jsonResponse({ error: "unreadable" }, 503)
          : jsonResponse({
              primitives: [
                { type: "skill", name: "tdd", description: "TDD loop" },
              ],
            });
      }),
    );
    renderWithQuery(
      <MemoryRouter initialEntries={["/inventory"]}>
        <InventoryPanel />
        <RereadTrigger />
      </MemoryRouter>,
    );
    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(skillsFact()).toBe("1");

    fail = true;
    await userEvent.click(
      screen.getByRole("button", { name: "Force re-read" }),
    );

    const heading = await screen.findByText("Inventory not read");
    expect(screen.getByText("tdd")).toBeInTheDocument();
    expect(skillsFact()).toBe("1");

    fail = false;
    const notice = heading.closest<HTMLElement>('[role="status"]');
    if (notice === null) throw new Error("the notice is not a status region");
    await userEvent.click(
      within(notice).getByRole("button", { name: "Re-read Skills" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Inventory not read")).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("tdd")).toBeInTheDocument();
  });

  describe("band 2", () => {
    // The Harness answers its origin and latest release; `failing` names the
    // reads that answer 503, and `tools` the global deploy-state's tools.
    const stubReads = (failing: string[] = [], tools?: ToolDeployState[]) =>
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (failing.some((path) => url.startsWith(path)))
            return jsonResponse({ error: "unreadable" }, 503);
          if (url === "/api/harness")
            return jsonResponse({
              origin: "github.com/acme/harness",
              github: { kind: "link", url: "https://github.com/acme/harness" },
              releasedVersion: "v1.4.0",
            });
          if (url.startsWith("/api/registry"))
            return jsonResponse({ repos: [] });
          if (url.startsWith("/api/deploy-state"))
            return jsonResponse({ primitives: [], skipped: [], tools });
          if (url.startsWith("/api/drift")) return jsonResponse({ behind: [] });
          return (
            withoutHarness(input) ??
            jsonResponse({
              primitives: [
                { type: "skill", name: "tdd", description: "TDD loop" },
              ],
            })
          );
        }),
      );

    it("states the Harness's origin and latest release, and Read once every reading answered", async () => {
      stubReads();
      renderPanel();

      expect(await screen.findByText("just now")).toBeInTheDocument();
      expect(factValue("Origin")).toBe("acme/harness");
      expect(factValue("Release")).toBe("v1.4.0");
      expect(skillsFact()).toBe("1");
    });

    it("dates Read by a release comparison older than the reads that carried it", async () => {
      stubReads(
        [],
        [
          {
            tool: "claude",
            primitives: [],
            releaseHead: {
              release: "v1.4.0",
              latestRelease: "v1.4.0",
              changed: 0,
              changedSkills: [],
              selected: 0,
              comparedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
            },
          },
        ],
      );
      renderPanel();

      expect(await screen.findByText("30 min ago")).toBeInTheDocument();
    });

    it("keeps the screen read and its age when one target is unreadable (#1492)", async () => {
      stubReads(["/api/deploy-state/global"]);
      renderPanel();

      expect(await screen.findByText("just now")).toBeInTheDocument();
      expect(screen.queryByText("Read failed")).toBeNull();
    });

    it("reads Unknown for the Harness facts when the Harness read fails", async () => {
      stubReads(["/api/harness"]);
      renderPanel();

      await waitFor(() => expect(factValue("Origin")).toBe("Unknown"));
      expect(factValue("Release")).toBe("Unknown");
    });
  });

  it("shows skeleton rows at once when Re-read Skills is pressed", async () => {
    let hang = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.startsWith("/api/registry")) return jsonResponse({ repos: [] });
        const harness = withoutHarness(input);
        if (harness !== null) return harness;
        if (url.startsWith("/api/deploy-state"))
          return jsonResponse({ primitives: [], skipped: [] });
        if (hang) return new Promise<Response>(() => undefined);
        return jsonResponse({
          primitives: [{ type: "skill", name: "tdd", description: "TDD loop" }],
        });
      }),
    );
    renderPanel();
    expect(await screen.findByText("tdd")).toBeInTheDocument();

    hang = true;
    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Skills" }),
    );

    const grid = screen.getByRole("grid", { name: "Skills table" });
    expect(grid).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("tdd")).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole("status")
        .find((each) => each.classList.contains("sr-only")),
    ).toHaveTextContent("Loading the Skills…");
  });
});
