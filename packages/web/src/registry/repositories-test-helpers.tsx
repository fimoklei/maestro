import type { RepoStatus } from "@maestro/core";
import { screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { ToastHost } from "../ui/toast";
import { RepositoriesView } from "./repositories-view";

// The Repositories screen's server: a registry that changes as the screen
// writes to it, a folder chooser, and a refusal per path.

export type FakeRegistry = {
  repos: { path: string; status: RepoStatus }[];
  /** Registration and check refusals, by the path sent. */
  refusals?: Record<string, string>;
  /** What the next Browse returns; `null` is a cancel. */
  pick?: string | null;
  chooser?: boolean;
  /** The list read fails with this status. */
  readFails?: number;
  /** The unregister answers with this status and code. */
  unregisterFails?: { status: number; error: string };
  /** A registration that never answers until resolved. */
  holdRegister?: Promise<void>;
  holdUnregister?: Promise<void>;
};

export function stubRegistry(state: FakeRegistry) {
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
          : jsonResponse({ available: state.chooser ?? true });
      }
      if (url === "/api/registry/repos/check" && body) {
        const refusal = state.refusals?.[body.path];
        return refusal
          ? jsonResponse({ error: refusal }, 400)
          : jsonResponse({ path: body.path });
      }
      if (url === "/api/registry/repos" && method === "POST" && body) {
        await state.holdRegister;
        const refusal = state.refusals?.[body.path];
        if (refusal) return jsonResponse({ error: refusal }, 400);
        state.repos = [...state.repos, { path: body.path, status: "ready" }];
        return jsonResponse(
          { repos: state.repos.map(({ path }) => ({ path })) },
          201,
        );
      }
      if (url === "/api/registry/repos" && method === "DELETE" && body) {
        await state.holdUnregister;
        if (state.unregisterFails) {
          return jsonResponse(
            { error: state.unregisterFails.error },
            state.unregisterFails.status,
          );
        }
        state.repos = state.repos.filter((repo) => repo.path !== body.path);
        return jsonResponse({ repos: state.repos });
      }
      if (url === "/api/registry/repos") {
        return state.readFails
          ? jsonResponse({ error: "unreadable" }, state.readFails)
          : jsonResponse({ repos: state.repos });
      }
      throw new Error(`unexpected ${method} ${url}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  const calls = (url: string, method: string) =>
    fetchMock.mock.calls
      .filter(
        ([u, init]) => String(u) === url && (init?.method ?? "GET") === method,
      )
      .map(([, init]) =>
        init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
      );
  return { calls };
}

export function renderRepositories() {
  return renderWithQuery(
    <MemoryRouter initialEntries={["/repositories"]}>
      <Routes>
        <Route path="/repositories" element={<RepositoriesView />} />
        <Route path="/" element={<h1>Deploy-state screen</h1>} />
      </Routes>
      <ToastHost />
    </MemoryRouter>,
  );
}

export const REGISTER = "Register repository";

// Hidden included: an open dialog takes the screen out of the tree.
export const statusRegion = () =>
  screen
    .getAllByRole("status", { hidden: true })
    .find((region) => region.closest("[role=dialog]") === null);
