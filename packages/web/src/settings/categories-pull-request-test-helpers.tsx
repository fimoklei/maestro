import type {
  CategoriesProposalCreated,
  CategoriesProposalPreview,
  CategoriesProposalRow,
  CategoryList,
  HarnessCategories,
} from "@maestro/core";
import { screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { vi } from "vitest";
import { jsonResponse, renderWithQuery } from "../test-utils";
import { CategoriesPage } from "./categories-page";

export const PULL = "https://github.com/fimoklei/agent-harness/pull";

const OWN: CategoryList = {
  categories: [{ name: "Planning", skills: 1, prompts: 0 }],
  assignments: [{ type: "skill", name: "tdd", category: "Planning" }],
};

const CHANGES: CategoriesProposalPreview = {
  kind: "changes",
  added: [{ name: "Planning", skills: 1, prompts: 0 }],
  deleted: [],
  moved: [{ type: "prompt", name: "notes", category: null }],
};

export type Answer = Response | (() => Response | Promise<Response>);

// Each read answers in turn; the last answer repeats.
export function stubServer({
  rows,
  preview = jsonResponse(CHANGES),
  create = jsonResponse({
    pullRequest: { state: "opened", number: 101, url: `${PULL}/101` },
  } satisfies CategoriesProposalCreated),
  harness = { kind: "none" },
}: {
  rows: (CategoriesProposalRow | Response)[];
  preview?: Answer;
  create?: Answer;
  harness?: HarnessCategories;
}) {
  const posts: string[] = [];
  const bodies: unknown[] = [];
  let read = 0;
  const answer = (value: Answer) =>
    typeof value === "function" ? value() : value.clone();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        posts.push(url);
        bodies.push(JSON.parse(String(init.body)));
        if (url === "/api/categories/proposal") return answer(create);
      }
      if (url === "/api/categories") return jsonResponse(OWN);
      if (url === "/api/categories/harness") return jsonResponse(harness);
      if (url === "/api/categories/proposal") {
        const row = rows[Math.min(read, rows.length - 1)];
        read += 1;
        return row instanceof Response ? row.clone() : jsonResponse(row);
      }
      if (url === "/api/categories/proposal/preview") return answer(preview);
      throw new Error(`unexpected ${url}`);
    }),
  );
  return { posts, bodies };
}

export const renderPage = () =>
  renderWithQuery(
    <MemoryRouter initialEntries={["/settings/categories"]}>
      <Routes>
        <Route path="/settings/categories" element={<CategoriesPage />} />
        <Route path="/harness" element={<p>Harness screen</p>} />
      </Routes>
    </MemoryRouter>,
  );

export const section = () =>
  screen.findByRole("region", { name: "Harness categories" });

// The buttons with words; the header's ✕ has none.
export const footerButtons = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("button")
    .map((button) => button.textContent)
    .filter((text) => text !== "");
