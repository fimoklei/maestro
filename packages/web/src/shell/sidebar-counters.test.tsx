import { screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stageRow } from "../harness/stage-row-fixture";
import type { HarnessStageRead } from "../harness/use-harness";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { Sidebar } from "./sidebar";

// The two sidebar counters (#1115): how many targets are behind, and how many
// skills wait on the operator in Pending review or Pending release.

afterEach(() => {
  vi.unstubAllGlobals();
});

const head = (release: string, latestRelease: string | null) => ({
  release,
  latestRelease,
  changed: null,
});

const read = (rows: ReturnType<typeof stageRow>[]): HarnessStageRead => ({
  outcome: "read",
  rows,
  bound: null,
});

type Reply = { body: unknown; status?: number };

function stubServer({
  global = { body: { tools: [], skipped: [] } },
  repos = {},
  harness = {},
}: {
  global?: Reply;
  repos?: Record<string, Reply>;
  harness?: Partial<Record<"proposal" | "review" | "release", unknown>> & {
    status?: number;
  };
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse(
          { inventoryPath: "/home/me/agent-harness", githubRepository: null },
          200,
        );
      }
      if (url.startsWith("/api/inventory/primitives")) {
        return jsonResponse({ primitives: [] }, 200);
      }
      if (url.startsWith("/api/harness")) {
        const { status = 200, ...stages } = harness;
        return jsonResponse(
          {
            origin: "github.com/fimoklei/agent-harness",
            releasedVersion: "v0.5.0",
            defaultBranch: "main",
            releaseState: "released",
            freshness: { outcome: null, lastFetchedAt: null },
            stages: {
              proposal: read([]),
              review: read([]),
              release: read([]),
              ...stages,
            },
          },
          status,
        );
      }
      if (url.startsWith("/api/registry/repos")) {
        return jsonResponse(
          {
            repos: Object.keys(repos).map((path) => ({
              path,
              status: "ok",
            })),
          },
          200,
        );
      }
      if (url.startsWith("/api/deploy-state/global")) {
        return jsonResponse(global.body, global.status ?? 200);
      }
      if (url.startsWith("/api/deploy-state?repo=")) {
        const repo = decodeURIComponent(url.split("repo=")[1] ?? "");
        const reply = repos[repo] ?? { body: {}, status: 404 };
        return jsonResponse(reply.body, reply.status ?? 200);
      }
      return jsonResponse({}, 404);
    }),
  );
}

function renderSidebar() {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/"]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

const screens = () => screen.getByRole("navigation", { name: "Screens" });
const author = () => screen.getByRole("navigation", { name: "Author" });

const repo = (releaseHead?: object, extra: object = {}): Reply => ({
  body: { primitives: [], skipped: [], releaseHead, ...extra },
});

describe("Deploy-state counter", () => {
  it("counts the targets that are behind", async () => {
    // Every tool row of a behind global target is behind (#951); an
    // unfinished operation stands before the newer release.
    stubServer({
      global: {
        body: {
          tools: [
            { tool: "claude", primitives: [], releaseHead: head("v1", "v2") },
            { tool: "codex", primitives: [], releaseHead: head("v1", "v1") },
          ],
          skipped: [],
        },
      },
      repos: {
        "/work/a": repo(head("v1", "v2")),
        "/work/b": repo(head("v2", "v2")),
        "/work/c": repo(head("v1", "v2"), {
          pendingOperation: { kind: "update" },
        }),
      },
    });
    renderSidebar();

    expect(
      await within(screens()).findByRole("button", {
        name: "Deploy-state 3 behind",
      }),
    ).toBeInTheDocument();
  });

  it("shows nothing where no target is behind", async () => {
    stubServer({ repos: { "/work/b": repo(head("v2", "v2")) } });
    renderSidebar();

    // The Harness read answering means every read of the frame has landed.
    await screen.findByText("v0.5.0 · 0 skills");
    expect(
      within(screens()).getByRole("button", { name: "Deploy-state" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/behind/)).not.toBeInTheDocument();
  });

  it("reads ? where a target could not be read", async () => {
    stubServer({
      repos: {
        "/work/a": repo(head("v1", "v2")),
        "/work/b": { body: {}, status: 500 },
      },
    });
    renderSidebar();

    const item = await within(screens()).findByRole("button", {
      name: "Deploy-state Unknown",
    });
    expect(within(item).getByText("?")).toBeInTheDocument();
  });
});

describe("Harness counter", () => {
  it("counts each skill in Pending review or Pending release once", async () => {
    stubServer({
      harness: {
        proposal: read([
          stageRow("pending-proposal", "draft-only", "not-yet-proposed"),
        ]),
        review: read([
          stageRow("pending-review", "tdd", "waiting-for-review"),
          stageRow("pending-review", "review", "draft"),
        ]),
        release: read([
          stageRow("pending-release", "review", "changed"),
          stageRow("pending-release", "ship", "added"),
        ]),
      },
    });
    renderSidebar();

    expect(
      await within(author()).findByRole("button", { name: "Harness 3" }),
    ).toBeInTheDocument();
  });

  it("shows nothing where no skill waits on review or release", async () => {
    stubServer({
      harness: {
        proposal: read([
          stageRow("pending-proposal", "draft-only", "not-yet-proposed"),
        ]),
      },
    });
    renderSidebar();

    await screen.findByText("v0.5.0 · 0 skills");
    expect(
      within(author()).getByRole("button", { name: "Harness" }),
    ).toBeInTheDocument();
  });

  it("reads ? where the review stage could not be read", async () => {
    stubServer({ harness: { review: { outcome: "unavailable" } } });
    renderSidebar();

    expect(
      await within(author()).findByRole("button", { name: "Harness Unknown" }),
    ).toBeInTheDocument();
  });
});
