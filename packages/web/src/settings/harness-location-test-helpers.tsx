import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { HarnessLocationPage } from "./harness-location-page";

// The Harness location page's server: the configured location, the Inventory
// read, the Harness read for the release, the folder chooser, and connect.

export const HARNESS_STATE = {
  origin: "github.com/fimoklei/agent-harness",
  releasedVersion: "v1.4.0",
  defaultBranch: "main",
  releaseState: "released",
  freshness: { outcome: null, lastFetchedAt: null },
  stages: {
    proposal: { outcome: "read", rows: [], bound: null },
    review: { outcome: "read", rows: [], bound: null },
    release: { outcome: "read", rows: [], bound: null },
  },
};

export function skill(name: string) {
  return { type: "skill", name, description: `${name} skill` };
}

type Answer = Response | Promise<Response>;

export type FakeServer = {
  inventoryPath?: string;
  githubRepository?: string | null;
  /** Called per read, so a re-read can see another answer. */
  primitives?: () => Answer;
  /** The connect answer for the path sent; by default it connects it. */
  connect?: (path: string) => Answer;
  scaffold?: (path: string) => Answer;
  /** What the next Browse returns; `null` is a cancel. */
  pick?: string | null;
};

export function stubServer(state: FakeServer = {}) {
  let inventoryPath = state.inventoryPath ?? "/home/me/agent-harness";
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body
        ? (JSON.parse(String(init.body)) as { path: string })
        : undefined;
      if (url === "/api/folder-chooser") {
        return method === "POST"
          ? jsonResponse({ path: state.pick ?? null })
          : jsonResponse({ available: true });
      }
      if (url === "/api/inventory/config") {
        return jsonResponse({
          inventoryPath,
          githubRepository:
            state.githubRepository === undefined
              ? "fimoklei/agent-harness"
              : state.githubRepository,
        });
      }
      if (url === "/api/inventory/primitives") {
        return state.primitives
          ? state.primitives()
          : jsonResponse({ primitives: [skill("tdd"), skill("review")] });
      }
      if (url === "/api/harness/scaffold" && body && state.scaffold) {
        return state.scaffold(body.path);
      }
      if (url.startsWith("/api/harness")) {
        return jsonResponse(HARNESS_STATE);
      }
      if (url === "/api/inventory/connect" && body) {
        if (state.connect) return state.connect(body.path);
        inventoryPath = body.path;
        return jsonResponse({
          outcome: "connected",
          inventoryPath: body.path,
          primitiveCount: 2,
        });
      }
      throw new Error(`unexpected ${method} ${url}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  const posts = (url: string) =>
    fetchMock.mock.calls
      .filter(([u, init]) => String(u) === url && init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)));
  return { fetchMock, posts };
}

export function renderPage() {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/settings/harness-location"]}>
      <HarnessLocationPage />
    </MemoryRouter>,
  );
}
