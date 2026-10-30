import type { CategoryList, InventoryPrimitive } from "@maestro/core";
import { screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { jsonResponse } from "../test-utils";

type Assignment = CategoryList["assignments"][number];

const listOf = (names: string[], assignments: Assignment[]): CategoryList => ({
  categories: names.map((name) => ({
    name,
    skills: assignments.filter(
      (each) => each.type === "skill" && each.category === name,
    ).length,
    prompts: assignments.filter(
      (each) => each.type === "prompt" && each.category === name,
    ).length,
  })),
  assignments,
});

/**
 * A server that keeps its own category list and answers every write with it
 * in whole; the Inventory read answers `primitives`. Returns the posts.
 */
export function stubCategoryServer({
  primitives,
  names = ["Planning", "Writing"],
  assignments = [],
  assign,
}: {
  primitives: readonly InventoryPrimitive[];
  names?: string[];
  assignments?: Assignment[];
  assign?: () => Response;
}) {
  const state = { names: [...names], assignments: [...assignments] };
  const posts: { url: string; body: unknown }[] = [];
  const key = (item: { type: string; name: string }) =>
    `${item.type}/${item.name}`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push({ url, body });
        if (url === "/api/categories/assign") {
          if (assign) return assign();
          const keys = new Set(body.items.map(key));
          state.assignments = [
            ...state.assignments.filter((each) => !keys.has(key(each))),
            ...(body.category === null
              ? []
              : body.items.map((item: Assignment) => ({
                  ...item,
                  category: body.category,
                }))),
          ];
          return jsonResponse(listOf(state.names, state.assignments));
        }
        if (url === "/api/categories") {
          state.names = [...state.names, body.name].sort();
          return jsonResponse({
            ...listOf(state.names, state.assignments),
            added: body.name,
          });
        }
      }
      if (url === "/api/categories") {
        return jsonResponse(listOf(state.names, state.assignments));
      }
      if (url.startsWith("/api/registry")) return jsonResponse({ repos: [] });
      if (url.startsWith("/api/deploy-state")) {
        return jsonResponse({ primitives: [], skipped: [] });
      }
      if (url.startsWith("/api/harness")) {
        return jsonResponse({ error: "not-configured" }, 409);
      }
      return jsonResponse({ primitives, unreadTypes: [] });
    }),
  );
  return posts;
}

/** The pane's Category fact. */
export const categoryFact = (pane: ReturnType<typeof within>) =>
  pane.getByText("Category", { selector: "dt" }).nextElementSibling;

/** The screen's own status region; a notice carries a role of its own. */
export const statusRegion = () => {
  const found = screen
    .getAllByRole("status")
    .find((each) => each.classList.contains("sr-only"));
  if (found === undefined) throw new Error("no status region");
  return found;
};

/** The open category menu, by its accessible name. */
export const categoryMenu = (name: string) =>
  within(screen.getByRole("group", { name }));
