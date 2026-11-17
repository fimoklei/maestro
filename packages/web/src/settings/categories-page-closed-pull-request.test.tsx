import type {
  CategoriesProposalPreview,
  CategoriesProposalRow,
} from "@maestro/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectTooltipCause, jsonResponse, sentence } from "../test-utils";
import {
  PULL,
  renderPage,
  section,
  stubServer,
} from "./categories-pull-request-test-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
});

type Closed = Extract<CategoriesProposalRow, { state: "closed" }>;

const closed = (over: Partial<Closed> = {}): CategoriesProposalRow => ({
  state: "closed",
  number: 45,
  url: `${PULL}/45`,
  author: "fimoklei",
  byOther: false,
  list: "ready",
  ...over,
});

const afterClose = (deletesBranch: boolean) =>
  jsonResponse({
    kind: "after-close",
    number: 45,
    deletesBranch,
    difference: {
      kind: "changes",
      added: [{ name: "Planning", skills: 1, prompts: 0 }],
      deleted: [],
      moved: [],
    },
  } satisfies CategoriesProposalPreview);

const createButton = async () =>
  within(await section()).findByRole("button", {
    name: "Create pull request",
  });

const openDialog = async () => {
  await userEvent.click(await createButton());
  return screen.findByRole("dialog", { name: "Create pull request" });
};

describe("the row after a close without merging", () => {
  it("states the operator's own closed pull request beside its chip and View on Harness", async () => {
    stubServer({ rows: [closed()] });
    renderPage();

    const region = await section();
    expect(
      await within(region).findByText(
        "Pull request #45 was closed without merging. Select Create pull request to propose your current categories as a new pull request.",
      ),
    ).toBeInTheDocument();
    expect(within(region).getByText("Proposal closed")).toBeInTheDocument();
    expect(
      within(region).getByRole("link", { name: "View on Harness" }),
    ).toBeInTheDocument();
    expect(await createButton()).not.toHaveAttribute("aria-disabled");
  });

  it("names another contributor's closed pull request and lets the operator create their own", async () => {
    stubServer({
      rows: [closed({ author: "mira", number: 46, byOther: true })],
    });
    renderPage();

    expect(
      await within(await section()).findByText(
        sentence(
          "mira's pull request #46 was closed without merging. Select Create pull request to propose your current categories as a new pull request.",
        ),
      ),
    ).toBeInTheDocument();
    expect(await createButton()).not.toHaveAttribute("aria-disabled");
  });

  it("keeps the closed sentence and blocks an empty list", async () => {
    stubServer({ rows: [closed({ list: "empty" })] });
    renderPage();

    expect(
      await within(await section()).findByText(
        "Pull request #45 was closed without merging. Select Create pull request to propose your current categories as a new pull request.",
      ),
    ).toBeInTheDocument();
    expectTooltipCause(await createButton(), "Add a category.");
  });
});

describe("the Create pull request dialog after a close without merging", () => {
  it("says the old pull request stays closed and Maestro deletes its branch", async () => {
    stubServer({ rows: [closed()], preview: afterClose(true) });
    renderPage();

    const dialog = await openDialog();

    expect(
      await within(dialog).findByText(
        "This creates a new pull request on GitHub that replaces the Harness categories with your list. Pull request #45 stays closed, and Maestro deletes its branch.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("group", { name: "Added to the Harness · 1" }),
    ).toBeInTheDocument();
  });

  it("leaves the branch deletion out where the branch holds another author's commits", async () => {
    stubServer({ rows: [closed()], preview: afterClose(false) });
    renderPage();

    const dialog = await openDialog();

    expect(
      await within(dialog).findByText(
        "This creates a new pull request on GitHub that replaces the Harness categories with your list. Pull request #45 stays closed.",
      ),
    ).toBeInTheDocument();
  });

  it("creates the new pull request and says so", async () => {
    const { posts } = stubServer({
      rows: [closed(), { state: "start" }],
      preview: afterClose(true),
    });
    renderPage();
    const dialog = await openDialog();
    await within(dialog).findByText("Compared with the next release");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create pull request" }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts).toEqual(["/api/categories/proposal"]);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Created pull request #101.",
    );
  });

  it("reports a push that failed after Maestro deleted the old branch", async () => {
    stubServer({
      rows: [closed()],
      preview: afterClose(true),
      create: jsonResponse({ error: "push-failed-after-delete" }, 502),
    });
    renderPage();
    const dialog = await openDialog();
    await within(dialog).findByText("Compared with the next release");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create pull request" }),
    );

    expect(
      await within(dialog).findByText("Pull request not created"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Your categories stay as they are. Select Close, then select Create pull request again.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Maestro deleted the branch of pull request #45, then could not push a new branch. Pull request #45 stays closed.",
      ),
    ).toBeInTheDocument();
  });
});
