import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { GlobalDeployStatePanel } from "./global-deploy-state-panel";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel() {
  return renderWithQuery(<GlobalDeployStatePanel onStartDeploy={() => {}} />);
}

describe("GlobalDeployStatePanel", () => {
  it("always labels the Global targets section, even while loading", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderPanel();

    // The section label is the baseline: it renders regardless of the read
    // state, so it is present even before any data arrives.
    expect(screen.getByText(/global targets/i)).toBeInTheDocument();
  });

  it("headlines a per-tool card and lists its deployed skill with the human tag version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            tools: [
              {
                tool: "claude",
                primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
              },
            ],
            skipped: [],
          },
          200,
        ),
      ),
    );
    renderPanel();

    // The tool is the headline; the destination path is the secondary detail.
    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("~/.claude/skills")).toBeInTheDocument();
    expect(screen.getByText("tdd")).toBeInTheDocument();
    expect(screen.getByText("v0.5.0")).toBeInTheDocument();
  });

  it("surfaces a visible error when the global lockfile cannot be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: "malformed", message: "irrelevant" }, 422),
      ),
    );
    renderPanel();

    expect(await screen.findByRole("status")).toHaveTextContent(
      /could not be read/i,
    );
  });

  it("shows global drift badges without needing a repo path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/drift/global") {
          return jsonResponse(
            { behind: [{ name: "tdd", current: "v0.5.0", latest: "v0.5.1" }] },
            200,
          );
        }
        return jsonResponse(
          {
            tools: [
              {
                tool: "claude",
                primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
              },
            ],
            skipped: [],
          },
          200,
        );
      }),
    );
    renderPanel();

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(await screen.findByText(/behind/i)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/drift/global", expect.anything());
  });

  it("shows unknown, never up-to-date, when global drift cannot be checked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/drift/global") {
          return jsonResponse({ ok: false }, 200);
        }
        return jsonResponse(
          {
            tools: [
              {
                tool: "claude",
                primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
              },
            ],
            skipped: [],
          },
          200,
        );
      }),
    );
    renderPanel();

    expect(await screen.findByText("tdd")).toBeInTheDocument();
    expect(await screen.findByText(/unknown/i)).toBeInTheDocument();
    expect(screen.queryByText(/up-to-date/i)).not.toBeInTheDocument();
  });
});
