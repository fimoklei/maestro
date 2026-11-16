import type {
  CategoriesProposalCreated,
  CategoriesProposalPreview,
  CategoriesProposalRow,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectTooltipCause, jsonResponse, sentence } from "../test-utils";
import {
  footerButtons,
  PULL,
  renderPage,
  section,
  stubServer,
} from "./categories-pull-request-test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

const WAITING =
  "Pull request #45 is open and waiting for a reviewer. Select Update pull request to send your current categories.";

const ownOpen = (
  list: Extract<CategoriesProposalRow, { state: "own-open" }>["list"],
): CategoriesProposalRow => ({
  state: "own-open",
  status: "waiting-for-review",
  number: 45,
  url: `${PULL}/45`,
  list,
});

const UPDATED = jsonResponse({
  pullRequest: { state: "updated", number: 45, url: `${PULL}/45` },
} satisfies CategoriesProposalCreated);

const update = (
  difference: Extract<
    CategoriesProposalPreview,
    { kind: "update" }
  >["difference"],
  deleted: Extract<
    CategoriesProposalPreview,
    { kind: "update" }
  >["deleted"] = [],
) =>
  jsonResponse({
    kind: "update",
    number: 45,
    difference,
    deleted,
  } satisfies CategoriesProposalPreview);

const updateButton = async () =>
  within(await section()).findByRole("button", {
    name: "Update pull request",
  });

const openDialog = async () => {
  await userEvent.click(await updateButton());
  return screen.findByRole("dialog", { name: "Update pull request #45" });
};

describe("the row while the operator's own pull request is open", () => {
  it("offers Update pull request beside the chip and View on Harness", async () => {
    stubServer({ rows: [ownOpen("same")] });
    renderPage();

    const region = await section();
    expect(await within(region).findByText(WAITING)).toBeInTheDocument();
    expect(await updateButton()).not.toHaveAttribute("aria-disabled");
    expect(
      within(region).queryByRole("button", { name: "Create pull request" }),
    ).toBeNull();
  });

  it("says when the list differs from the pull request", async () => {
    stubServer({ rows: [ownOpen("differs")] });
    renderPage();

    expect(
      await within(await section()).findByText(
        `${WAITING} Your categories differ from the pull request.`,
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ["empty", "Add a category."],
    ["over-limits", "Delete categories."],
  ] as const)(
    "keeps the pull request's sentence for a list that is %s and blocks the button",
    async (list, cause) => {
      stubServer({ rows: [ownOpen(list)] });
      renderPage();

      expect(
        await within(await section()).findByText(WAITING),
      ).toBeInTheDocument();
      expectTooltipCause(await updateButton(), cause);
    },
  );
});

describe("the Update pull request dialog", () => {
  it("compares with the pull request and warns of what a merge deletes from the next release", async () => {
    stubServer({
      rows: [ownOpen("differs")],
      preview: update(
        {
          kind: "changes",
          added: [{ name: "Review", skills: 1, prompts: 0 }],
          deleted: [{ name: "Drafts", skills: 0, prompts: 0 }],
          moved: [{ type: "skill", name: "tdd", category: null }],
        },
        [{ name: "Debugging", skills: 2, prompts: 0 }],
      ),
    });
    renderPage();

    const dialog = await openDialog();

    expect(
      within(dialog).getByText(
        "This updates your open pull request #45 with your current categories. A curator reviews it and decides whether to merge it. Your categories stay as they are.",
      ),
    ).toBeInTheDocument();
    expect(
      await within(dialog).findByText("Not yet in pull request #45"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("group", {
        name: "Added to the pull request · 1",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("group", {
        name: "Deleted from the pull request · 1",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("group", {
        name: "Moved to another category · 1",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("This pull request deletes 1 Harness category"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        sentence(
          "Once it is merged, 2 skills in Debugging have no category in the Harness.",
        ),
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Update pull request" }),
    ).toBeInTheDocument();
  });

  it("offers only Close when the list equals the pull request", async () => {
    stubServer({
      rows: [ownOpen("same")],
      preview: update({ kind: "unchanged" }),
    });
    renderPage();

    const dialog = await openDialog();

    expect(
      await within(dialog).findByText("Your categories match the pull request"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "An update would change nothing in the pull request.",
      ),
    ).toBeInTheDocument();
    expect(footerButtons(dialog)).toEqual(["Close"]);
  });

  it("still updates when it cannot compare with the pull request", async () => {
    stubServer({
      rows: [ownOpen("differs")],
      preview: update({ kind: "uncompared" }),
    });
    renderPage();

    const dialog = await openDialog();

    expect(
      await within(dialog).findByText("Couldn't compare with the pull request"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Update pull request" }),
    ).not.toHaveAttribute("aria-disabled");
  });

  it("updates the pull request, closes, and says so", async () => {
    const { posts, bodies } = stubServer({
      rows: [ownOpen("differs"), ownOpen("same")],
      preview: update({
        kind: "changes",
        added: [{ name: "Review", skills: 0, prompts: 0 }],
        deleted: [],
        moved: [],
      }),
      create: UPDATED,
    });
    renderPage();
    const dialog = await openDialog();
    await within(dialog).findByText("Not yet in pull request #45");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Update pull request" }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts).toEqual(["/api/categories/proposal"]);
    // The server refuses a write the dialog did not show.
    expect(bodies).toEqual([{ previewed: "update" }]);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Updated pull request #45.",
    );
    expect(await screen.findByText(WAITING)).toBeInTheDocument();
  });

  it("reports a failed push in the words of an update", async () => {
    stubServer({
      rows: [ownOpen("differs")],
      preview: update({ kind: "uncompared" }),
      create: jsonResponse({ error: "promote-failed" }, 502),
    });
    renderPage();
    const dialog = await openDialog();
    await within(dialog).findByText("Couldn't compare with the pull request");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Update pull request" }),
    );

    expect(
      await within(dialog).findByText("Pull request not updated"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Your categories stay as they are. Select Close, then select Update pull request again.",
      ),
    ).toBeInTheDocument();
  });
});
