import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { ToastHost } from "../ui/toast";
import { DeployStateView } from "./deploy-state-view";

// Answered by URL. A body is served with 200; `{ status, body }` sets the status.
type Answer = unknown | { status: number; body: unknown };

export type ServerState = {
  repos?: string[] | Answer;
  global?: Answer;
  repo?: Record<string, Answer>;
  // "global" or a repo path; defaults to nothing behind.
  drift?: Record<string, Answer>;
  other?: (url: string, init?: RequestInit) => Response | Promise<Response>;
};

const isStatus = (
  answer: Answer,
): answer is { status: number; body: unknown } =>
  typeof answer === "object" &&
  answer !== null &&
  "status" in answer &&
  "body" in answer;

// A pending promise stands for a read that never answers.
const respond = (answer: Answer): Response | Promise<Response> =>
  answer instanceof Promise
    ? answer
    : isStatus(answer)
      ? jsonResponse(answer.body, answer.status)
      : jsonResponse(answer, 200);

const EMPTY_TARGET = { primitives: [], skipped: [] };

export function stubServer(read: () => ServerState) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const state = read();
      if (url === "/api/registry/repos") {
        const repos = state.repos ?? [];
        return Array.isArray(repos)
          ? jsonResponse({ repos: repos.map((path) => ({ path })) })
          : respond(repos);
      }
      if (url === "/api/deploy-state/global") {
        return respond(state.global ?? { tools: [], skipped: [] });
      }
      if (url.startsWith("/api/deploy-state?repo=")) {
        const repo = decodeURIComponent(url.split("repo=")[1] ?? "");
        return respond(state.repo?.[repo] ?? EMPTY_TARGET);
      }
      if (url === "/api/drift/global") {
        return respond(state.drift?.global ?? { behind: [] });
      }
      if (url.startsWith("/api/drift?repo=")) {
        const repo = decodeURIComponent(url.split("repo=")[1] ?? "");
        return respond(state.drift?.[repo] ?? { behind: [] });
      }
      if (state.other) {
        return state.other(url, init);
      }
      throw new Error(`unexpected request ${url}`);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function renderDeployState(state?: { openTarget: string }) {
  return renderWithQuery(
    <MemoryRouter initialEntries={[{ pathname: "/", state }]}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <DeployStateView />
              <ToastHost />
            </>
          }
        />
        <Route path="/inventory" element={<p>inventory view</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

export const grid = () =>
  screen.getByRole("grid", { name: "Deploy-state table" });

export function rowOf(name: string): HTMLElement {
  const row = within(grid())
    .getAllByRole("row")
    .find((candidate) =>
      within(candidate)
        .queryAllByRole("gridcell")[0]
        ?.textContent?.startsWith(name),
    );
  if (row === undefined) throw new Error(`no row for ${name}`);
  return row;
}

export function cellsOf(name: string): string[] {
  return within(rowOf(name))
    .getAllByRole("gridcell")
    .slice(0, 4)
    .map((cell) => cell.textContent ?? "");
}

export async function findRow(name: string): Promise<HTMLElement> {
  await screen.findAllByText(name);
  return rowOf(name);
}

export async function openPane(name: string) {
  await userEvent.click(
    within(await findRow(name)).getAllByRole("gridcell")[0] as HTMLElement,
  );
  return screen.findByRole("complementary", { name: `${name} detail` });
}

export const RECENT = () => new Date().toISOString();
