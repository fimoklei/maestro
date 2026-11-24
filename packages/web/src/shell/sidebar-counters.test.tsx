import type {
  HarnessStageRead,
  HarnessState,
  RegistryEntry,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STAGE_TITLES, stageRows } from "../harness/harness-flow-fixture";
import { stageRow } from "../harness/stage-row-fixture";
import {
  expectDescription,
  jsonResponse,
  renderWithQuery,
  shownTooltip,
} from "../test-utils";
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
  global = { body: { primitives: [], folders: [], skipped: [] } },
  repos = {},
  missing = [],
  registryStatus = 200,
  harness = {},
}: {
  global?: Reply;
  repos?: Record<string, Reply>;
  missing?: string[];
  registryStatus?: number;
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
            repos: [
              ...Object.keys(repos).map((path) => ({
                path,
                status: "ready" as const,
              })),
              ...missing.map((path) => ({
                path,
                status: "folder-missing" as const,
              })),
            ] satisfies RegistryEntry[],
          },
          registryStatus,
        );
      }
      if (url.startsWith("/api/deploy-state/global")) {
        return jsonResponse(global.body, global.status ?? 200);
      }
      if (url.startsWith("/api/deploy-state?repo=")) {
        const repo = decodeURIComponent(url.split("repo=")[1] ?? "");
        const reply = repos[repo] ?? {
          body: { error: "not-registered" },
          status: 403,
        };
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
    // Global is one target, however many folders it writes; an unfinished
    // operation stands before the newer release.
    stubServer({
      global: {
        body: {
          primitives: [],
          folders: [
            { path: "~/.claude/skills", tool: "claude", detected: true },
            { path: "~/.agents/skills", tool: "codex", detected: true },
          ].map((folder) => ({
            ...folder,
            primitives: [],
          })),
          releaseHead: head("v1", "v2"),
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
        name: "Deploy-state 2 behind",
      }),
    ).toBeInTheDocument();
  });

  it("shows nothing where no target is behind", async () => {
    stubServer({ repos: { "/work/b": repo(head("v2", "v2")) } });
    renderSidebar();

    // The Harness read answering means every read of the frame has landed.
    await screen.findByText("v0.5.0");
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

describe("Deploy-state counter with a missing repository folder", () => {
  it("counts the other targets behind, leaving the missing folder out", async () => {
    stubServer({
      repos: { "/work/a": repo(head("v1", "v2")) },
      missing: ["/work/gone"],
    });
    renderSidebar();

    expect(
      await within(screens()).findByRole("button", {
        name: "Deploy-state 1 behind",
      }),
    ).toBeInTheDocument();
  });

  it("shows nothing where only missing folders and no target behind stand", async () => {
    stubServer({ missing: ["/work/gone"] });
    renderSidebar();

    await screen.findByText("v0.5.0");
    await waitFor(() =>
      expect(
        within(screens()).getByRole("button", { name: "Deploy-state" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("?")).not.toBeInTheDocument();
  });
});

describe("Deploy-state counter's ? tooltip", () => {
  it("names exactly the targets whose read failed, on hover and for a screen reader", async () => {
    stubServer({
      global: { body: {}, status: 500 },
      repos: {
        "/work/a": repo(head("v1", "v2")),
        "/work/b": { body: {}, status: 500 },
      },
      missing: ["/work/gone"],
    });
    renderSidebar();

    const item = await within(screens()).findByRole("button", {
      name: "Deploy-state Unknown",
    });
    const detail =
      "Couldn't read Global and /work/b. Select Re-read Deploy-state on the Deploy-state screen.";
    expectDescription(item, detail);
    await userEvent.hover(item);
    expect(await shownTooltip()).toHaveTextContent(`Deploy-state${detail}`);
  });

  it("names the registry read when the list of repositories couldn't be read", async () => {
    stubServer({ registryStatus: 500 });
    renderSidebar();

    expectDescription(
      await within(screens()).findByRole("button", {
        name: "Deploy-state Unknown",
      }),
      "Couldn't read the list of registered repositories. Select Re-read Deploy-state on the Deploy-state screen.",
    );
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

    await screen.findByText("v0.5.0");
    expect(
      within(author()).getByRole("button", { name: "Harness" }),
    ).toBeInTheDocument();
  });

  it.each(["proposal", "review", "release"] as const)(
    "reads ? where the %s stage couldn't be read",
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
