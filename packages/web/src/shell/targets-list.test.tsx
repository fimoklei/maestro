import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { TargetsList } from "./targets-list";

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderTargets() {
  return renderWithQuery(<TargetsList />);
}

// A local target's full path is its title (the visible label is shortened to
// the path tail — #211), so locate rows by title, falling back to text for a
// tool row (a plain label with no title).
function rowFor(label: string) {
  const node = (screen.queryByTitle(label) ?? screen.getByText(label)).closest(
    "li",
  );
  if (!node) {
    throw new Error(`no target row for ${label}`);
  }
  return node;
}

// Routes by URL: one row per detected tool plus one per registered repo, each
// joining drift against its own deployed set — `▲N` only when deployed there.
function stubFetch(options: {
  tools: unknown;
  globalBehind: unknown;
  repos?: unknown;
  repoDeployState?: unknown;
  repoDrift?: unknown;
  otherOrigins?: unknown;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes("/api/registry/repos")) {
        return jsonResponse({ repos: options.repos ?? [] }, 200);
      }
      if (target.includes("/api/deploy-state/global")) {
        return jsonResponse(
          {
            tools: options.tools,
            skipped: [],
            otherOrigins: options.otherOrigins ?? [],
          },
          200,
        );
      }
      if (target.includes("/api/deploy-state")) {
        return jsonResponse(
          options.repoDeployState ?? { primitives: [], skipped: [] },
          200,
        );
      }
      if (target.includes("/api/drift/global")) {
        return jsonResponse(options.globalBehind, 200);
      }
      return jsonResponse(options.repoDrift ?? { behind: [] }, 200);
    }),
  );
}

const tddBehind = {
  behind: [
    { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
  ],
};
const claudeWithTdd = {
  tool: "claude",
  primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
};
const codexWithTdd = {
  tool: "codex",
  primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
};

describe("TargetsList", () => {
  it("lists one row per detected tool and each registered repo, with no single Global row", async () => {
    stubFetch({
      tools: [claudeWithTdd, codexWithTdd],
      globalBehind: { behind: [] },
      repos: [{ path: "/Users/me/app" }],
      repoDeployState: {
        primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
        skipped: [],
      },
      repoDrift: { behind: [] },
    });
    renderTargets();

    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    await screen.findByTitle("/Users/me/app");
    expect(screen.queryByText("Global")).not.toBeInTheDocument();
  });

  it("shows a checking row while tool detection is still loading, never a silently empty list", async () => {
    // The global deploy-state read (which detects installed tools) hangs. With no
    // tool data yet, the sidebar must still say it is checking — a bare empty list
    // would read as "no global targets", hiding that detection has not finished.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const target = String(url);
        if (target.includes("/api/registry/repos")) {
          return jsonResponse({ repos: [] }, 200);
        }
        if (target.includes("/api/deploy-state/global")) {
          return new Promise<Response>(() => {});
        }
        if (target.includes("/api/drift/global")) {
          return jsonResponse({ behind: [] }, 200);
        }
        return jsonResponse({ behind: [] }, 200);
      }),
    );
    renderTargets();

    expect(await screen.findByText(/checking/i)).toBeInTheDocument();
  });

  it("shows an unknown row when tool detection fails, not an empty list", async () => {
    // A failed global deploy-state read must be visible: a real failure looked
    // like "no global targets" before this row existed. It reads unknown, never
    // in sync (J04).
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const target = String(url);
        if (target.includes("/api/registry/repos")) {
          return jsonResponse({ repos: [] }, 200);
        }
        if (target.includes("/api/deploy-state/global")) {
          return jsonResponse({ error: "boom" }, 500);
        }
        if (target.includes("/api/drift/global")) {
          return jsonResponse({ behind: [] }, 200);
        }
        return jsonResponse({ behind: [] }, 200);
      }),
    );
    renderTargets();

    expect(await screen.findByText(/unknown/i)).toBeInTheDocument();
    expect(screen.queryByText(/in sync/i)).not.toBeInTheDocument();
  });

  it("shows ▲N on a tool that has a deployed skill behind, counting only that tool's skills", async () => {
    // The single global drift check reports tdd behind; both tools deploy tdd, so
    // each tool's row narrows the check to its own skills and reads ▲1.
    stubFetch({
      tools: [claudeWithTdd, codexWithTdd],
      globalBehind: tddBehind,
    });
    renderTargets();

    await screen.findByText("Claude Code");
    expect(within(rowFor("Claude Code")).getByText("▲1")).toBeInTheDocument();
    expect(within(rowFor("Codex")).getByText("▲1")).toBeInTheDocument();
  });

  it("reads a tool with nothing behind as in sync, with no ▲ badge", async () => {
    stubFetch({ tools: [claudeWithTdd], globalBehind: { behind: [] } });
    renderTargets();

    await screen.findByText("Claude Code");
    expect(
      within(rowFor("Claude Code")).getByText(/in sync/i),
    ).toBeInTheDocument();
    expect(
      within(rowFor("Claude Code")).queryByText(/▲/),
    ).not.toBeInTheDocument();
  });

  it("does not let an orphan-behind (not deployed on the tool) inflate its count", async () => {
    // The check reports foo behind, but claude deploys only tdd — nothing behind
    // here can be updated, so the row stays in sync with no ▲.
    stubFetch({
      tools: [claudeWithTdd],
      globalBehind: {
        behind: [
          {
            name: "foo",
            current: "v1.0.0",
            latest: "v1.1.0",
            reading: "behind",
          },
        ],
      },
    });
    renderTargets();

    await screen.findByText("Claude Code");
    expect(
      within(rowFor("Claude Code")).getByText(/in sync/i),
    ).toBeInTheDocument();
    expect(
      within(rowFor("Claude Code")).queryByText(/▲/),
    ).not.toBeInTheDocument();
  });

  it("reads a detected tool with nothing deployed as empty, not in sync", async () => {
    stubFetch({
      tools: [{ tool: "claude", primitives: [] }],
      globalBehind: { behind: [] },
    });
    renderTargets();

    await screen.findByText("Claude Code");
    expect(
      within(rowFor("Claude Code")).getByText(/empty/i),
    ).toBeInTheDocument();
    expect(
      within(rowFor("Claude Code")).queryByText(/in sync/i),
    ).not.toBeInTheDocument();
  });

  it("reads a detected tool holding a foreign origin as 'Other origin', not empty (#655)", async () => {
    stubFetch({
      tools: [{ tool: "claude", primitives: [] }],
      globalBehind: { behind: [] },
      otherOrigins: ["fimoklei/agent-harness"],
    });
    renderTargets();

    await screen.findByText("Claude Code");
    expect(
      within(rowFor("Claude Code")).getByText(/other origin/i),
    ).toBeInTheDocument();
    expect(
      within(rowFor("Claude Code")).queryByText(/^empty$/i),
    ).not.toBeInTheDocument();
  });

  it("shows ▲N on a registered repo that has a deployed skill behind", async () => {
    stubFetch({
      tools: [],
      globalBehind: { behind: [] },
      repos: [{ path: "/Users/me/app" }],
      repoDeployState: {
        primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
        skipped: [],
      },
      repoDrift: tddBehind,
    });
    renderTargets();

    await screen.findByTitle("/Users/me/app");
    expect(
      await within(rowFor("/Users/me/app")).findByText("▲1"),
    ).toBeInTheDocument();
  });

  it("does not mark a repo behind for a primitive it has not deployed", async () => {
    stubFetch({
      tools: [],
      globalBehind: { behind: [] },
      repos: [{ path: "/Users/me/app" }],
      repoDeployState: {
        primitives: [{ type: "skill", name: "tdd", version: "v0.5.0" }],
        skipped: [],
      },
      repoDrift: {
        behind: [
          {
            name: "foo",
            current: "v1.0.0",
            latest: "v1.1.0",
            reading: "behind",
          },
        ],
      },
    });
    renderTargets();

    await screen.findByTitle("/Users/me/app");
    expect(
      await within(rowFor("/Users/me/app")).findByText(/in sync/i),
    ).toBeInTheDocument();
    expect(
      within(rowFor("/Users/me/app")).queryByText(/▲/),
    ).not.toBeInTheDocument();
  });
});
