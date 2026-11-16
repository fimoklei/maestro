import type {
  CategoryList,
  HarnessCategories,
  HarnessState,
} from "@maestro/core";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "../shell/app-router";
import { jsonResponse, noCategories, renderWithQuery } from "../test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

const LISTED = {
  kind: "listed",
  tag: "v1.5.0",
  count: 2,
  changed: false,
} satisfies HarnessCategories;

const COPIED = {
  categories: [{ name: "Planning", skills: 1, prompts: 0 }],
  assignments: [{ type: "skill", name: "tdd", category: "Planning" }],
} satisfies CategoryList;

const HARNESS = {
  origin: "github.com/fimoklei/agent-harness",
  releasedVersion: null,
  defaultBranch: "main",
  releaseState: "never-released",
  freshness: { outcome: null, lastFetchedAt: null },
  cloneSync: "current",
  localHeadCommit: null,
  stages: {
    proposal: { outcome: "read", rows: [], bound: null },
    review: { outcome: "read", rows: [], bound: null },
    release: { outcome: "read", rows: [], bound: null },
  },
} satisfies HarnessState;

// The Connect gate over a server that connects at once; `seen` answers the
// gate's offer read, `copy` the copy it runs on Continue.
function stubServer({
  seen,
  copy = () => jsonResponse(COPIED),
}: {
  seen: () => Response;
  copy?: () => Response;
}) {
  let inventoryPath: string | null = null;
  const posts: { url: string; body: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        posts.push({ url, body: String(init.body) });
      }
      const none = noCategories(input);
      if (none) return none;
      if (url === "/api/categories/harness/seen") return seen();
      if (url === "/api/categories/harness/copy") return copy();
      if (url.startsWith("/api/inventory/config")) {
        return jsonResponse({ inventoryPath }, 200);
      }
      if (url.startsWith("/api/inventory/connect")) {
        inventoryPath = "/home/me/agent-harness";
        return jsonResponse(
          { outcome: "found", inventoryPath, primitiveCount: 3 },
          200,
        );
      }
      if (url.startsWith("/api/harness")) return jsonResponse(HARNESS);
      return jsonResponse(
        { ok: true, repos: [], primitives: [], skipped: [], behind: [] },
        200,
      );
    }),
  );
  return {
    copies: () =>
      posts.filter((each) => each.url === "/api/categories/harness/copy"),
  };
}

async function connect() {
  renderWithQuery(
    <MemoryRouter initialEntries={["/welcome/connect"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
  await userEvent.type(
    await screen.findByLabelText("Harness folder or GitHub URL"),
    "/home/me/agent-harness",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Connect Harness" }),
  );
  await screen.findByText("Harness connected");
}

const continueToSkills = () =>
  userEvent.click(screen.getByRole("button", { name: "Continue to Skills" }));

const landedOnSkills = async () =>
  expect(
    await screen.findByRole("heading", { name: /^skills$/i }),
  ).toBeInTheDocument();

describe("the Connect gate's Harness categories offer", () => {
  it("offers the copy checked, and copies on Continue to Skills", async () => {
    const server = stubServer({ seen: () => jsonResponse(LISTED) });
    await connect();

    const box = await screen.findByRole("checkbox", {
      name: "Copy Harness categories",
    });
    expect(box).toBeChecked();
    expect(box).toHaveAccessibleDescription(
      "You can also copy them later in Categories in Settings.",
    );
    await continueToSkills();

    await landedOnSkills();
    expect(server.copies()).toEqual([
      {
        url: "/api/categories/harness/copy",
        body: JSON.stringify({ mode: "add" }),
      },
    ]);
  });

  it("copies nothing when the box is cleared", async () => {
    const server = stubServer({ seen: () => jsonResponse(LISTED) });
    await connect();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Copy Harness categories" }),
    );
    await continueToSkills();

    await landedOnSkills();
    expect(server.copies()).toEqual([]);
  });

  it.each([
    ["has no categories", { kind: "none" }],
    ["has a broken categories file", { kind: "faulty", tag: "v1.5.0" }],
  ] as const)("offers no copy when the release %s", async (_, offer) => {
    const server = stubServer({
      seen: () => jsonResponse(offer satisfies HarnessCategories),
    });
    await connect();
    await continueToSkills();

    await landedOnSkills();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(server.copies()).toEqual([]);
  });

  // #1908: the operator still moves to Skills, where the failure shows.
  it("moves to Skills and states the failed copy there, with a close control", async () => {
    stubServer({
      seen: () => jsonResponse(LISTED),
      copy: () => jsonResponse({ error: "harness-categories-unread" }, 502),
    });
    await connect();
    await screen.findByRole("checkbox", { name: "Copy Harness categories" });

    await continueToSkills();

    await landedOnSkills();
    expect(screen.getByText("Categories not copied")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Maestro couldn't read the latest Harness release, so nothing was copied. You can also copy them later in Categories in Settings.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Close Categories not copied" }),
    );
    expect(screen.queryByText("Categories not copied")).toBeNull();
    expect(document.activeElement).toHaveAccessibleName("Re-read Skills");
  });
});
