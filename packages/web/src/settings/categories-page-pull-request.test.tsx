import type {
  CategoriesProposalCreated,
  CategoriesProposalPreview,
  CategoriesProposalRow,
  CategoryList,
  HarnessCategories,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  expectTooltipCause,
  jsonResponse,
  renderWithQuery,
  sentence,
} from "../test-utils";
import { CategoriesPage } from "./categories-page";

afterEach(() => {
  vi.unstubAllGlobals();
});

const PULL = "https://github.com/fimoklei/agent-harness/pull";

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

type Answer = Response | (() => Response | Promise<Response>);

// Each read answers in turn; the last answer repeats.
function stubServer({
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
  let read = 0;
  const answer = (value: Answer) =>
    typeof value === "function" ? value() : value.clone();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST") {
        posts.push(url);
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
  return { posts };
}

const renderPage = () =>
  renderWithQuery(
    <MemoryRouter initialEntries={["/settings/categories"]}>
      <Routes>
        <Route path="/settings/categories" element={<CategoriesPage />} />
        <Route path="/harness" element={<p>Harness screen</p>} />
      </Routes>
    </MemoryRouter>,
  );

const section = () =>
  screen.findByRole("region", { name: "Harness categories" });

const createButton = async () =>
  within(await section()).findByRole("button", {
    name: "Create pull request",
  });

// The buttons with words; the header's ✕ has none.
const footerButtons = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole("button")
    .map((button) => button.textContent)
    .filter((text) => text !== "");

const openDialog = async () => {
  await userEvent.click(await createButton());
  return screen.findByRole("dialog", { name: "Create pull request" });
};

describe("the row Pull request to the Harness", () => {
  it("offers Create pull request for an own list, also where the Harness carries no categories", async () => {
    stubServer({ rows: [{ state: "start" }] });
    renderPage();

    const button = await createButton();
    expect(button).not.toHaveAttribute("aria-disabled");
    const region = await section();
    expect(
      within(region).getByText("Pull request to the Harness"),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(
        "Propose your categories for the connected Harness. This creates a pull request for review.",
      ),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(
        "The latest Harness release contains no categories.",
      ),
    ).toBeInTheDocument();
  });

  it.each<[string, CategoriesProposalRow | Response, string, string]>([
    [
      "an empty own list",
      { state: "empty" },
      "Add or copy at least one category before creating a pull request.",
      "Add a category.",
    ],
    [
      "another contributor's open pull request",
      {
        state: "waiting-on-other",
        author: "mira",
        number: 46,
        url: `${PULL}/46`,
      },
      "mira has pull request #46 open for the Harness categories. Wait until it is merged or closed.",
      "Wait for pull request #46.",
    ],
    [
      "a list over the file's limits",
      { state: "over-limits" },
      "The Harness takes at most 200 categories in a file of at most 256 KB. Delete categories before creating a pull request.",
      "Delete categories.",
    ],
    [
      "a Harness or GitHub it could not read",
      { state: "unread" },
      "Maestro couldn't read the Harness or GitHub. Select Re-read Categories to try again.",
      "Re-read Categories first.",
    ],
    [
      "a row it could not read",
      jsonResponse({ error: "categories-unreadable" }, 500),
      "Maestro couldn't read the Harness or GitHub. Select Re-read Categories to try again.",
      "Re-read Categories first.",
    ],
  ])(
    "blocks Create pull request for %s, with its cause",
    async (_, row, text, cause) => {
      stubServer({ rows: [row] });
      renderPage();

      const region = await section();
      expect(
        await within(region).findByText(sentence(text)),
      ).toBeInTheDocument();
      expectTooltipCause(await createButton(), cause);
    },
  );

  it.each([
    [
      "waiting-for-review",
      "Waiting for review",
      "Pull request #45 is open and waiting for a reviewer. Select Update pull request to send your current categories.",
    ],
    [
      "changes-requested",
      "Changes requested",
      "A reviewer asked for changes on pull request #45. Change your categories, then select Update pull request to send them.",
    ],
  ] as const)(
    "states the operator's own pull request, %s, with View on Harness",
    async (status, chip, text) => {
      stubServer({
        rows: [{ state: "own-open", status, number: 45, url: `${PULL}/45` }],
      });
      renderPage();

      const region = await section();
      expect(await within(region).findByText(text)).toBeInTheDocument();
      expect(within(region).getByText(chip)).toBeInTheDocument();
      expect(
        within(region).queryByRole("button", { name: "Create pull request" }),
      ).toBeNull();
      await userEvent.click(
        within(region).getByRole("link", { name: "View on Harness" }),
      );
      expect(await screen.findByText("Harness screen")).toBeInTheDocument();
    },
  );

  it("states a pushed branch without a pull request and offers to finish it", async () => {
    stubServer({ rows: [{ state: "pull-request-missing" }] });
    renderPage();

    const region = await section();
    expect(
      await within(region).findByText(
        "The proposal branch is on GitHub without a pull request. Select Create pull request to open one.",
      ),
    ).toBeInTheDocument();
    expect(
      within(region).getByText("Pull request missing"),
    ).toBeInTheDocument();
    expect(
      within(region).getByRole("link", { name: "View on Harness" }),
    ).toBeInTheDocument();
    expect(
      within(region).getByRole("button", { name: "Create pull request" }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("reads the row again with Re-read Categories", async () => {
    stubServer({ rows: [{ state: "unread" }, { state: "start" }] });
    renderPage();
    await within(await section()).findByText(sentence(/couldn't read/));

    await userEvent.click(
      screen.getByRole("button", { name: "Re-read Categories" }),
    );

    expect(
      await within(await section()).findByText(
        "Propose your categories for the connected Harness. This creates a pull request for review.",
      ),
    ).toBeInTheDocument();
  });
});

describe("the Create pull request dialog", () => {
  it("states what the pull request does and its difference against the next release", async () => {
    stubServer({ rows: [{ state: "start" }] });
    renderPage();

    const dialog = await openDialog();

    expect(
      within(dialog).getByText(
        "This creates a pull request on GitHub that replaces the Harness categories with your list. A curator reviews it and decides whether to merge it. Your categories stay as they are.",
      ),
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByText("Compared with the next release"),
    ).toBeInTheDocument();
    const added = within(dialog).getByRole("group", {
      name: "Added to the Harness · 1",
    });
    expect(within(added).getByText("Planning")).toBeInTheDocument();
    expect(within(added).getByText("1 skill")).toBeInTheDocument();
    const moved = within(dialog).getByRole("group", {
      name: "Moved to another category · 1",
    });
    expect(within(moved).getByText("notes")).toBeInTheDocument();
    expect(within(moved).getByText("No category")).toBeInTheDocument();
    // An empty group is hidden.
    expect(
      within(dialog).queryByRole("group", { name: /Deleted from the Harness/ }),
    ).toBeNull();
    expect(within(dialog).queryByText(/deletes/)).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Create pull request" }),
    ).toBeInTheDocument();
  });

  it("warns, and confirms with a danger button, when the pull request deletes Harness categories", async () => {
    stubServer({
      rows: [{ state: "start" }],
      preview: jsonResponse({
        kind: "changes",
        added: [],
        deleted: [
          { name: "Debugging", skills: 3, prompts: 1 },
          { name: "Review", skills: 0, prompts: 1 },
        ],
        moved: [],
      } satisfies CategoriesProposalPreview),
    });
    renderPage();

    const dialog = await openDialog();

    expect(
      await within(dialog).findByText(
        "This pull request deletes 2 Harness categories",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        sentence(
          "Once it is merged, 3 skills and 2 prompts in Debugging and Review have no category in the Harness.",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Create pull request" }),
    ).toBeInTheDocument();
  });

  it("offers only Close when the list matches the next release", async () => {
    stubServer({
      rows: [{ state: "start" }],
      preview: jsonResponse({
        kind: "unchanged",
      } satisfies CategoriesProposalPreview),
    });
    renderPage();

    const dialog = await openDialog();

    expect(
      await within(dialog).findByText("Your categories match the next release"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "A pull request would change nothing in the Harness.",
      ),
    ).toBeInTheDocument();
    expect(footerButtons(dialog)).toEqual(["Close"]);
  });

  it("still creates the pull request when it cannot compare with the next release", async () => {
    stubServer({
      rows: [{ state: "start" }],
      preview: jsonResponse({
        kind: "uncompared",
      } satisfies CategoriesProposalPreview),
    });
    renderPage();

    const dialog = await openDialog();

    expect(
      await within(dialog).findByText("Couldn't compare with the next release"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Create pull request" }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("states a refusal the fresh read found, with only Close", async () => {
    stubServer({
      rows: [{ state: "start" }],
      preview: jsonResponse({ error: "proposed-by-other" }, 409),
    });
    renderPage();

    const dialog = await openDialog();

    expect(
      await within(dialog).findByText(
        "Another contributor's pull request is open",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Create pull request" }),
    ).toBeNull();
  });

  it("creates the pull request, closes, and the row states where it stands", async () => {
    const { posts } = stubServer({
      rows: [
        { state: "start" },
        {
          state: "own-open",
          status: "waiting-for-review",
          number: 101,
          url: `${PULL}/101`,
        },
      ],
    });
    renderPage();
    const dialog = await openDialog();
    await within(dialog).findByText("Compared with the next release");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create pull request" }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts).toEqual(["/api/categories/proposal"]);
    expect(
      await screen.findByText(
        "Pull request #101 is open and waiting for a reviewer. Select Update pull request to send your current categories.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Created pull request #101.",
    );
  });

  it.each<[string, Answer, string, string]>([
    [
      "a failed push",
      jsonResponse({ error: "promote-failed" }, 502),
      "Pull request not created",
      "Your categories stay as they are. Select Close, then select Create pull request again.",
    ],
    [
      "a server that did not answer",
      () => Promise.reject(new TypeError("fetch failed")),
      "Pull request not confirmed",
      "The Maestro server did not respond, so the pull request may already be open. Select Close, then check the Harness screen.",
    ],
    [
      "a pushed branch without a pull request",
      jsonResponse({
        pullRequest: { state: "missing", gh: "available" },
      } satisfies CategoriesProposalCreated),
      "Pull request not opened",
      "Maestro pushed your categories to the branch maestro/list.categories, but GitHub opened no pull request. Select Close, then check the Harness screen.",
    ],
  ])("reports %s in the dialog", async (_, create, heading, message) => {
    stubServer({ rows: [{ state: "start" }], create });
    renderPage();
    const dialog = await openDialog();
    await within(dialog).findByText("Compared with the next release");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create pull request" }),
    );

    expect(await within(dialog).findByText(heading)).toBeInTheDocument();
    expect(within(dialog).getByText(sentence(message))).toBeInTheDocument();
    expect(footerButtons(dialog)).toEqual(["Close"]);
  });
});
