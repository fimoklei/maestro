import type { HarnessStageRead, HarnessState } from "@maestro/core";
import { screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAGE_TITLES, stageRows } from "../harness/harness-flow-fixture";
import { stageRow } from "../harness/stage-row-fixture";
import { jsonResponse, renderWithQuery, sentence } from "../test-utils";
import { AppRoutes } from "./app-router";
import { Sidebar } from "./sidebar";

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
  harness?: Partial<
    Record<"proposal" | "review" | "release", HarnessStageRead>
  > & {
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
            cloneSync: "current",
            localHeadCommit: null,
            stages: {
              proposal: read([]),
              review: read([]),
              release: read([]),
              ...stages,
            },
          } satisfies HarnessState,
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
    await screen.findByText(sentence("v0.5.0 · 0 skills"));
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
  // A skill in two stages is two rows in the Harness table, so it counts twice.
  const PENDING = {
    proposal: read([
      stageRow("pending-proposal", "draft-only", "not-yet-proposed"),
    ]),
    review: read([
      stageRow("pending-review", "tdd", "waiting-for-review"),
      stageRow("pending-review", "review", "draft"),
    ]),
    release: read([
      stageRow("pending-release", "review", "not-yet-released"),
      stageRow("pending-release", "ship", "not-yet-released", {
        change: "addition",
      }),
    ]),
  };

  it("counts every row in the three Pending stages", async () => {
    stubServer({ harness: PENDING });
    renderSidebar();

    expect(
      await within(author()).findByRole("button", {
        name: "Harness 5 pending",
      }),
    ).toBeInTheDocument();
  });

  it("states the number of pending rows the Harness table shows", async () => {
    stubServer({ harness: PENDING });
    renderWithQuery(
      <MemoryRouter initialEntries={["/harness"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    const counter = await within(author()).findByRole("button", {
      name: /^Harness \d+ pending$/,
    });
    const pendingRows = (
      await Promise.all(STAGE_TITLES.map((stage) => stageRows(stage)))
    ).flat().length;
    expect(counter).toHaveAccessibleName(`Harness ${pendingRows} pending`);
  });

  it("shows nothing where no row is pending", async () => {
    stubServer({});
    renderSidebar();

    await screen.findByText(sentence("v0.5.0 · 0 skills"));
    expect(
      within(author()).getByRole("button", { name: "Harness" }),
    ).toBeInTheDocument();
  });

  it.each(["proposal", "review", "release"] as const)(
    "reads ? where the %s stage could not be read",
    async (stage) => {
      stubServer({ harness: { [stage]: { outcome: "unavailable" } } });
      renderSidebar();

      expect(
        await within(author()).findByRole("button", {
          name: "Harness Unknown",
        }),
      ).toBeInTheDocument();
    },
  );
});
