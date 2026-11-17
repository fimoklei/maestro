import type {
  CategoryList,
  CopyFacts,
  CopyPreview,
  HarnessCategories,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { statusRegion } from "../categories/category-server-test-helpers";
import { jsonResponse, renderWithQuery, sentence } from "../test-utils";
import { CategoriesPage } from "./categories-page";

afterEach(() => {
  vi.unstubAllGlobals();
});

const LISTED: HarnessCategories = {
  kind: "listed",
  tag: "v1.5.0",
  count: 2,
  changed: false,
};

const facts = (facts: Partial<CopyFacts>): CopyFacts => ({
  added: [],
  deleted: [],
  unchanged: [],
  respelled: [],
  moved: { skills: 0, prompts: 0 },
  uncategorised: { skills: 0, prompts: 0 },
  ...facts,
});

const EMPTY_OWN: CopyPreview = {
  tag: "v1.5.0",
  count: 2,
  skipped: 0,
  choice: false,
  modes: {
    add: facts({ added: ["Planning", "Review"] }),
    replace: facts({ added: ["Planning", "Review"] }),
  },
  fresh: [],
};

const WITH_OWN: CopyPreview = {
  ...EMPTY_OWN,
  choice: true,
  modes: {
    add: facts({ added: ["Planning"], unchanged: ["Drafts", "review"] }),
    replace: facts({
      added: ["Planning"],
      deleted: ["Drafts"],
      unchanged: ["Review"],
    }),
  },
};

const COPIED: CategoryList = {
  categories: [
    { name: "Planning", skills: 1, prompts: 0 },
    { name: "Review", skills: 0, prompts: 0 },
  ],
  assignments: [{ type: "skill", name: "tdd", category: "Planning" }],
};

type Answer = () => Response | Promise<Response>;

// The Categories page's server: the own list, the Harness categories, the
// copy preview and the copy. Returns the copies posted.
function stubServer({
  own = { categories: [], assignments: [] },
  preview = () => jsonResponse(EMPTY_OWN),
  copy = () => jsonResponse(COPIED),
}: {
  own?: CategoryList;
  preview?: Answer;
  copy?: Answer;
} = {}) {
  const copies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/categories") return jsonResponse(own);
      if (url === "/api/categories/harness") return jsonResponse(LISTED);
      if (url === "/api/categories/harness/preview") return preview();
      if (url === "/api/categories/harness/copy") {
        copies.push(JSON.parse(String(init?.body)));
        return copy();
      }
      throw new Error(`unexpected ${url}`);
    }),
  );
  return copies;
}

const renderPage = () =>
  renderWithQuery(
    <MemoryRouter initialEntries={["/settings/categories"]}>
      <CategoriesPage />
    </MemoryRouter>,
  );

const openDialog = async () => {
  await userEvent.click(
    await screen.findByRole("button", { name: "Copy from Harness" }),
  );
  return within(
    await screen.findByRole("dialog", { name: "Copy Harness categories" }),
  );
};

const groupNames = (dialog: ReturnType<typeof within>, legend: RegExp) =>
  within(dialog.getByRole("group", { name: legend }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

describe("Copy Harness categories", () => {
  it("offers the copy under Harness categories with the approved row sentence", async () => {
    stubServer();
    renderPage();

    const section = await screen.findByRole("region", {
      name: "Harness categories",
    });
    expect(
      await within(section).findByText(
        "Copies the Harness categories into your list.",
      ),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "Copy from Harness" }),
    ).toHaveTextContent(/^Copy from Harness$/);
  });

  it("states it is loading until the preview answers", async () => {
    let answer: (response: Response) => void = () => {};
    stubServer({
      preview: () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    renderPage();

    const dialog = await openDialog();

    expect(dialog.getByText("Loading categories…")).toBeInTheDocument();
    answer(jsonResponse(EMPTY_OWN));
    expect(await dialog.findByText(/has 2 categories/)).toBeInTheDocument();
  });

  it("copies into an empty list without the choice and states what it adds", async () => {
    const copies = stubServer();
    renderPage();

    const dialog = await openDialog();

    expect(
      await dialog.findByText(
        sentence("Harness release v1.5.0 has 2 categories."),
      ),
    ).toBeInTheDocument();
    expect(dialog.queryByRole("radio")).toBeNull();
    expect(groupNames(dialog, /^Added · 2$/)).toEqual(["Planning", "Review"]);
    expect(dialog.queryByRole("group", { name: /^Deleted/ })).toBeNull();
    expect(dialog.queryByRole("group", { name: /^Unchanged/ })).toBeNull();

    await userEvent.click(
      dialog.getByRole("button", { name: "Copy categories" }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(copies).toEqual([{ mode: "add" }]);
    expect(await screen.findByText("Review")).toBeInTheDocument();
    expect(statusRegion()).toHaveTextContent("Copied Harness categories.");
  });

  it("offers Add and Replace to an operator with categories, Add preselected", async () => {
    const copies = stubServer({
      own: {
        categories: [
          { name: "Drafts", skills: 0, prompts: 0 },
          { name: "review", skills: 0, prompts: 0 },
        ],
        assignments: [],
      },
      preview: () => jsonResponse(WITH_OWN),
    });
    renderPage();

    const dialog = await openDialog();

    const add = await dialog.findByRole("radio", { name: "Add" });
    expect(add).toBeChecked();
    expect(add).toHaveAccessibleDescription(
      "Adds the categories you don't have and gives each skill or prompt without a category its Harness category.",
    );
    expect(
      dialog.getByRole("radio", { name: "Replace" }),
    ).toHaveAccessibleDescription(
      "Deletes the categories only you have. Every skill and prompt gets its Harness category, or none.",
    );
    expect(dialog.queryByText("How to copy")).toBeNull();
    expect(dialog.queryByText("What happens to your categories")).toBeNull();
    expect(groupNames(dialog, /^Added · 1$/)).toEqual(["Planning"]);
    expect(groupNames(dialog, /^Unchanged · 2$/)).toEqual(["Drafts", "review"]);
    expect(dialog.queryByRole("group", { name: /^Deleted/ })).toBeNull();

    await userEvent.click(dialog.getByRole("radio", { name: "Replace" }));

    expect(groupNames(dialog, /^Deleted · 1$/)).toEqual(["Drafts"]);
    expect(groupNames(dialog, /^Unchanged · 1$/)).toEqual(["Review"]);

    await userEvent.click(dialog.getByRole("radio", { name: "Add" }));
    await userEvent.click(
      dialog.getByRole("button", { name: "Copy categories" }),
    );

    await waitFor(() => expect(copies).toEqual([{ mode: "add" }]));
  });

  it("marks only the categories new since the operator last looked with their release", async () => {
    stubServer({
      preview: () => jsonResponse({ ...WITH_OWN, fresh: ["Planning"] }),
    });
    renderPage();

    const dialog = await openDialog();

    expect(await dialog.findByText(sentence("New in v1.5.0"))).toBeVisible();
    expect(groupNames(dialog, /^Added · 1$/)).toEqual([
      "PlanningNew in v1.5.0",
    ]);
    expect(groupNames(dialog, /^Unchanged · 2$/)).toEqual(["Drafts", "review"]);
  });

  // The worked example of #1892, plus a name Replace respells.
  const TAKES: CopyPreview = {
    ...WITH_OWN,
    modes: {
      add: facts({ added: ["Planning"], unchanged: ["Drafts", "review"] }),
      replace: facts({
        added: ["Planning"],
        deleted: ["Drafts"],
        unchanged: ["Review"],
        respelled: [{ name: "Review", was: "review" }],
        moved: { skills: 2, prompts: 0 },
        uncategorised: { skills: 0, prompts: 1 },
      }),
    },
  };
  const OWN = {
    categories: [
      { name: "Drafts", skills: 1, prompts: 1 },
      { name: "review", skills: 1, prompts: 0 },
    ],
    assignments: [],
  } satisfies CategoryList;

  it("warns and asks for a danger confirm when Replace takes sorting, and copies with Replace", async () => {
    const copies = stubServer({ own: OWN, preview: () => jsonResponse(TAKES) });
    renderPage();

    const dialog = await openDialog();
    await userEvent.click(
      await dialog.findByRole("radio", { name: "Replace" }),
    );

    expect(
      dialog.getByText("Replace deletes 1 of your categories"),
    ).toBeInTheDocument();
    expect(
      dialog.getByText(
        sentence(
          "Drafts isn't in the Harness categories. 2 skills will move to another category, and 1 prompt will have no category. They stay in the Harness. You can't undo Replace. Select Add to keep everything you have.",
        ),
      ),
    ).toBeInTheDocument();
    const confirm = dialog.getByRole("button", { name: "Copy categories" });
    expect(confirm).toHaveClass("text-red-11");

    await userEvent.click(confirm);

    await waitFor(() => expect(copies).toEqual([{ mode: "replace" }]));
  });

  it("states how the operator spelled a name Replace respells, on its Unchanged row", async () => {
    stubServer({ own: OWN, preview: () => jsonResponse(TAKES) });
    renderPage();

    const dialog = await openDialog();
    await userEvent.click(
      await dialog.findByRole("radio", { name: "Replace" }),
    );

    expect(groupNames(dialog, /^Unchanged · 1$/)).toEqual([
      "ReviewSpelled review in your list",
    ]);
  });

  it("drops the warning and the danger confirm when Add is selected again", async () => {
    stubServer({ own: OWN, preview: () => jsonResponse(TAKES) });
    renderPage();

    const dialog = await openDialog();
    await userEvent.click(
      await dialog.findByRole("radio", { name: "Replace" }),
    );
    await userEvent.click(dialog.getByRole("radio", { name: "Add" }));

    expect(dialog.queryByText(/^Replace deletes/)).toBeNull();
    expect(
      dialog.getByRole("button", { name: "Copy categories" }),
    ).not.toHaveClass("text-red-11");
  });

  it.each<[string, CopyFacts]>([
    ["only adds", facts({ added: ["Planning"], unchanged: ["Drafts"] })],
    ["the lists are equal", facts({ unchanged: ["Drafts"] })],
  ])(
    "shows no warning and a normal confirm when Replace %s",
    async (_, replace) => {
      stubServer({
        own: OWN,
        preview: () =>
          jsonResponse({
            ...WITH_OWN,
            modes: { ...WITH_OWN.modes, replace },
          } satisfies CopyPreview),
      });
      renderPage();

      const dialog = await openDialog();
      await userEvent.click(
        await dialog.findByRole("radio", { name: "Replace" }),
      );

      expect(dialog.queryByText(/^Replace (deletes|changes)/)).toBeNull();
      expect(
        dialog.getByRole("button", { name: "Copy categories" }),
      ).not.toHaveClass("text-red-11");
    },
  );

  it.each([
    [1, "The categories file has 1 entry with an error. It won't be copied."],
    [3, "The categories file has 3 entries with errors. They won't be copied."],
  ])("states the %i entries the file skipped", async (skipped, text) => {
    stubServer({ preview: () => jsonResponse({ ...EMPTY_OWN, skipped }) });
    renderPage();

    const dialog = await openDialog();

    expect(await dialog.findByText(text)).toBeInTheDocument();
  });

  it("states nothing skipped for a clean file", async () => {
    stubServer();
    renderPage();

    const dialog = await openDialog();

    await dialog.findByText(/has 2 categories/);
    expect(dialog.queryByText(/entr(y|ies) with/)).toBeNull();
  });

  it("shows Copying… on the confirm while the copy runs", async () => {
    stubServer({ copy: () => new Promise<Response>(() => {}) });
    renderPage();

    const dialog = await openDialog();
    await userEvent.click(
      await dialog.findByRole("button", { name: "Copy categories" }),
    );

    expect(dialog.getByRole("button", { name: "Copying…" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it.each<[string, Answer, string]>([
    [
      "a release without categories",
      () => jsonResponse({ error: "no-harness-categories" }, 409),
      "The latest Harness release has no categories to copy. Select Close, then select Re-read Categories.",
    ],
    [
      "a release Maestro could not read",
      () => jsonResponse({ error: "harness-categories-unread" }, 503),
      "Maestro couldn't read the latest Harness release. Select Copy categories to try again.",
    ],
    [
      "no answer",
      () => {
        throw new TypeError("Failed to fetch");
      },
      "Select Copy categories to try again.",
    ],
  ])("states a failed copy for %s", async (_, copy, message) => {
    stubServer({ copy });
    renderPage();

    const dialog = await openDialog();
    await userEvent.click(
      await dialog.findByRole("button", { name: "Copy categories" }),
    );

    expect(
      await dialog.findByText("Couldn't copy Harness categories"),
    ).toBeInTheDocument();
    expect(dialog.getByText(message)).toBeInTheDocument();
    expect(
      dialog
        .getAllByRole("button", { name: "Close" })
        .map((button) => button.textContent),
    ).toContain("Close");
  });

  it.each<[string, Answer, string]>([
    [
      "a release without categories",
      () => jsonResponse({ error: "no-harness-categories" }, 409),
      "The latest Harness release has no categories to copy. Select Close, then select Re-read Categories.",
    ],
    [
      "a release Maestro could not read",
      () => jsonResponse({ error: "harness-categories-unread" }, 503),
      "Maestro couldn't read the latest Harness release. Select Close, then select Copy from Harness to try again.",
    ],
  ])(
    "states a preview that failed for %s, with nothing to copy",
    async (_, preview, message) => {
      stubServer({ preview });
      renderPage();

      const dialog = await openDialog();

      expect(
        await dialog.findByText("Couldn't load Harness categories"),
      ).toBeInTheDocument();
      expect(dialog.getByText(message)).toBeInTheDocument();
      expect(
        dialog.queryByRole("button", { name: "Copy categories" }),
      ).toBeNull();
    },
  );
});
