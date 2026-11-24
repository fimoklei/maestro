import type { CategoriesProposalError } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { plainText } from "../ui/phrase";
import {
  ADDED_TO_HARNESS,
  ADDED_TO_PULL_REQUEST,
  COMPARED_WITH_NEXT_RELEASE,
  CREATE_PULL_REQUEST_BODY,
  comparedWithPullRequest,
  comparingWithPullRequest,
  createAfterCloseBody,
  DELETED_FROM_HARNESS,
  DELETED_FROM_PULL_REQUEST,
  MOVED_TO_ANOTHER_CATEGORY,
  NEXT_RELEASE_UNREADABLE,
  PULL_REQUEST_NOT_OPENED,
  PULL_REQUEST_ROW,
  pullRequestDeletes,
  pullRequestNotice,
  pullRequestRow,
  pullRequestUnreadable,
  SAME_AS_NEXT_RELEASE,
  sameAsPullRequest,
  updatePullRequestBody,
  updatePullRequestTitle,
  VIEW_ON_HARNESS,
} from "./pull-request-copy";

const PULL = "https://github.com/fimoklei/agent-harness/pull";

// Approved sentences, as exact strings.
describe("the pull-request row", () => {
  it("names the row and its link", () => {
    expect(PULL_REQUEST_ROW).toBe("Propose to Harness");
    expect(VIEW_ON_HARNESS).toBe("View on Harness");
  });

  it.each<[Parameters<typeof pullRequestRow>[0], string, string | null]>([
    [
      { state: "start" },
      "Propose your categories for the connected Harness. This creates a pull request for review.",
      null,
    ],
    [
      { state: "empty" },
      "Add or copy at least one category before creating a pull request.",
      "Add a category.",
    ],
    [
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
      {
        state: "own-open",
        status: "waiting-for-review",
        number: 45,
        url: `${PULL}/45`,
        list: "same",
      },
      "Pull request #45 is open and waiting for a reviewer. It already contains your current categories.",
      null,
    ],
    [
      { state: "over-limits" },
      "Your list is too large for the Harness categories file. Delete categories before creating a pull request.",
      "Delete categories.",
    ],
    [
      {
        state: "own-open",
        status: "waiting-for-review",
        number: 45,
        url: `${PULL}/45`,
        list: "empty",
      },
      "Pull request #45 is open and waiting for a reviewer. Add or copy at least one category before updating the pull request.",
      "Add a category.",
    ],
    [
      {
        state: "own-open",
        status: "waiting-for-review",
        number: 45,
        url: `${PULL}/45`,
        list: "over-limits",
      },
      "Pull request #45 is open and waiting for a reviewer. Your list is too large for the Harness categories file. Delete categories before creating a pull request.",
      "Delete categories.",
    ],
    [
      {
        state: "own-open",
        status: "changes-requested",
        number: 45,
        url: `${PULL}/45`,
        list: "same",
      },
      "A reviewer asked for changes on pull request #45. Change your categories, then update the pull request to send them.",
      null,
    ],
    [
      { state: "pull-request-missing", list: "ready" },
      "The proposal branch is on GitHub without a pull request. You can create one from your current categories.",
      null,
    ],
    [
      { state: "pull-request-missing", list: "empty" },
      "The proposal branch is on GitHub without a pull request. You can create one from your current categories.",
      "Add a category.",
    ],
    [
      {
        state: "merged-not-released",
        number: 45,
        url: `${PULL}/45`,
        list: "ready",
      },
      "Pull request #45 was merged. Teammates will get these categories with the next Harness release.",
      null,
    ],
    [
      {
        state: "merged-not-released",
        number: 45,
        url: `${PULL}/45`,
        list: "over-limits",
      },
      "Pull request #45 was merged. Teammates will get these categories with the next Harness release.",
      "Delete categories.",
    ],
    [
      {
        state: "own-open",
        status: "waiting-for-review",
        number: 45,
        url: `${PULL}/45`,
        list: "differs",
      },
      "Pull request #45 is open and waiting for a reviewer. Your categories differ from it. Update the pull request to send them.",
      null,
    ],
    [
      {
        state: "own-open",
        status: "changes-requested",
        number: 45,
        url: `${PULL}/45`,
        list: "empty",
      },
      "A reviewer asked for changes on pull request #45. Add or copy at least one category before updating the pull request.",
      "Add a category.",
    ],
    [
      {
        state: "own-open",
        status: "changes-requested",
        number: 45,
        url: `${PULL}/45`,
        list: "over-limits",
      },
      "A reviewer asked for changes on pull request #45. Your list is too large for the Harness categories file. Delete categories before creating a pull request.",
      "Delete categories.",
    ],
    [
      {
        state: "own-open",
        status: "changes-requested",
        number: 45,
        url: `${PULL}/45`,
        list: "differs",
      },
      "A reviewer asked for changes on pull request #45. Change your categories, then update the pull request to send them. Your categories differ from pull request #45.",
      null,
    ],
    [
      {
        state: "closed",
        number: 45,
        url: `${PULL}/45`,
        byOther: false,
        author: "me",
        list: "ready",
      },
      "Pull request #45 was closed without merging. You can propose your current categories in a new pull request.",
      null,
    ],
    [
      {
        state: "closed",
        number: 45,
        url: `${PULL}/45`,
        byOther: true,
        author: "mira",
        list: "ready",
      },
      "mira's pull request #45 was closed without merging. You can propose your current categories in a new pull request.",
      null,
    ],
    [
      { state: "no-usable-origin" },
      "Your clone has no GitHub origin. Point the clone's origin at the Harness repository on GitHub, then select Re-read Categories.",
      "Point the clone's origin at GitHub first.",
    ],
  ])("states %j", (row, sentence, blocked) => {
    const view = pullRequestRow(row);
    expect(plainText(view.sentence)).toBe(sentence);
    expect(view.blocked).toBe(blocked);
  });
});

describe("the Update pull request dialog", () => {
  it("states what the update does and what it compares with", () => {
    expect(updatePullRequestTitle(45)).toBe("Update pull request #45");
    expect(updatePullRequestBody(45)).toBe(
      "This updates your open pull request #45 with your current categories.",
    );
    expect(comparingWithPullRequest(45)).toBe(
      "Comparing with pull request #45…",
    );
    expect(comparedWithPullRequest(45)).toBe("Compared with pull request #45");
    expect(ADDED_TO_PULL_REQUEST).toBe("Added to the pull request");
    expect(DELETED_FROM_PULL_REQUEST).toBe("Deleted from the pull request");
  });

  it("says when the list equals the pull request", () => {
    expect(sameAsPullRequest(45)).toEqual({
      level: "info",
      label: "Your categories match pull request #45",
      message: "Change your categories before you update the pull request.",
    });
  });

  it("says when it cannot compare with the pull request", () => {
    expect(pullRequestUnreadable(45)).toEqual({
      level: "warning",
      label: "Couldn't compare with pull request #45",
      message:
        "The categories file in pull request #45 contains an error. Update the pull request.",
    });
  });

  it("warns of the Harness categories merging deletes and the items they leave", () => {
    const warning = pullRequestDeletes([
      { name: "Debugging", skills: 1, prompts: 2 },
      { name: "Release", skills: 1, prompts: 0 },
      { name: "Review", skills: 1, prompts: 0 },
      { name: "Writing", skills: 0, prompts: 0 },
    ]);
    expect(warning.level).toBe("warning");
    expect(warning.label).toBe("Merging deletes 4 Harness categories");
    expect(plainText(warning.message)).toBe(
      "The Harness then no longer has Debugging, Release, Review and Writing, and 3 skills and 2 prompts have no category.",
    );
  });

  it("warns of one deleted category, with one item or none", () => {
    const one = pullRequestDeletes([
      { name: "Release", skills: 1, prompts: 0 },
    ]);
    expect(one.label).toBe("Merging deletes 1 Harness category");
    expect(plainText(one.message)).toBe(
      "The Harness then no longer has Release, and 1 skill has no category.",
    );
    expect(
      plainText(
        pullRequestDeletes([{ name: "Writing", skills: 0, prompts: 0 }])
          .message,
      ),
    ).toBe("The Harness then no longer has Writing.");
  });

  it("states a list the write refuses as too large", () => {
    expect(
      pullRequestNotice(new HttpError(409, "", "list-too-large"), 45, null),
    ).toEqual({
      level: "error",
      label: "Too many categories",
      message:
        "Your list is too large for the Harness categories file. Delete categories before creating a pull request.",
    });
  });

  it("names the update in its failures", () => {
    expect(
      pullRequestNotice(new TypeError("fetch failed"), 45, null),
    ).toMatchObject({
      message:
        "The Maestro server didn't respond, so the pull request may already be updated. Select Close, then check the Harness screen.",
    });
    expect(
      pullRequestNotice(new HttpError(502, "", "promote-failed"), 45, null),
    ).toMatchObject({
      label: "Pull request not updated",
      message:
        "Your categories stay as they are. Select Close, then select Update pull request again.",
    });
    expect(
      pullRequestNotice(new HttpError(409, "", "request-unchanged"), 45, null),
    ).toEqual({
      level: "error",
      label: "Your categories match pull request #45",
      message: "Nothing was pushed.",
    });
  });

  // Provisional: no ticket wrote it.
  it("says the pull request changed while the dialog stood", () => {
    expect(
      pullRequestNotice(new HttpError(409, "", "proposal-changed"), 45, null),
    ).toEqual({
      level: "error",
      label: "Pull request changed",
      message:
        "Nothing was pushed. The pull request changed while this dialog was open. Select Close, then select Re-read Categories to see where it stands.",
    });
  });
});

describe("the Create pull request dialog", () => {
  it("states what the pull request does and what stays", () => {
    expect(CREATE_PULL_REQUEST_BODY).toBe(
      "This creates a pull request on GitHub that replaces the Harness categories with your list.",
    );
    expect(COMPARED_WITH_NEXT_RELEASE).toBe("Compared with the next release");
    expect(ADDED_TO_HARNESS).toBe("Added to the Harness");
    expect(DELETED_FROM_HARNESS).toBe("Deleted from the Harness");
    expect(MOVED_TO_ANOTHER_CATEGORY).toBe("Moved to another category");
  });

  it("says when the list matches the next release", () => {
    expect(SAME_AS_NEXT_RELEASE).toEqual({
      level: "info",
      label: "Your categories match the next release",
      message: "A pull request would change nothing in the Harness.",
    });
  });

  it("says when it cannot compare with the next release", () => {
    expect(NEXT_RELEASE_UNREADABLE).toEqual({
      level: "warning",
      label: "Couldn't compare with the next release",
      message:
        "The categories file in the next release contains an error. Your pull request replaces the whole file, so you can still create it.",
    });
  });

  it("claims nothing about GitHub when the server did not answer", () => {
    expect(
      pullRequestNotice(new TypeError("fetch failed"), null, null),
    ).toMatchObject({
      label: "Pull request not confirmed",
      message:
        "The Maestro server didn't respond, so the pull request may already be open. Select Close, then check the Harness screen.",
    });
  });

  it("reports a failed push", () => {
    expect(
      pullRequestNotice(new HttpError(502, "", "promote-failed"), null, null),
    ).toMatchObject({
      label: "Pull request not created",
      message:
        "Your categories stay as they are. Select Close, then select Create pull request again.",
    });
  });

  it("states the deleted branch of the closed pull request when the push after it failed", () => {
    expect(
      pullRequestNotice(
        new HttpError(502, "", "push-failed-after-delete"),
        null,
        45,
      ),
    ).toEqual({
      level: "error",
      label: "Pull request not created",
      message:
        "Your categories stay as they are. Select Close, then select Create pull request again.",
      detail:
        "Maestro deleted the branch of pull request #45, then couldn't push a new branch. Pull request #45 stays closed.",
    });
  });

  it("states the body after a close, with the branch deletion only where Maestro deletes it", () => {
    expect(createAfterCloseBody(45, true)).toBe(
      "This creates a new pull request on GitHub that replaces the Harness categories with your list. Pull request #45 stays closed, and Maestro deletes its branch.",
    );
    expect(createAfterCloseBody(45, false)).toBe(
      "This creates a new pull request on GitHub that replaces the Harness categories with your list. Pull request #45 stays closed.",
    );
  });

  it("states categories it couldn't read when proposing them", () => {
    expect(
      pullRequestNotice(
        new HttpError(409, "", "categories-unreadable"),
        null,
        null,
      )?.label,
    ).toBe("Couldn't read your categories");
  });

  it("reports a pushed branch without a pull request", () => {
    expect(PULL_REQUEST_NOT_OPENED.label).toBe("Pull request not opened");
    expect(plainText(PULL_REQUEST_NOT_OPENED.message)).toBe(
      "Your categories are on the branch maestro/list.categories. Select Close, then select Create pull request to open one.",
    );
  });

  // One reason per server code.
  it.each<CategoriesProposalError>([
    "not-configured",
    "categories-unreadable",
    "no-usable-origin",
    "no-answer",
    "list-empty",
    "list-too-large",
    "list-unchanged",
    "proposed-by-other",
    "request-unchanged",
    "proposal-changed",
    "push-elsewhere",
    "promote-failed",
    // Shares the heading of promote-failed; its detail differs.
    "push-failed-after-delete",
    "promote-in-progress",
  ])("gives %s its own heading", (code) => {
    const heading = pullRequestNotice(
      new HttpError(409, "", code),
      45,
      null,
    )?.label;
    expect(heading).toBeDefined();
    expect(heading).not.toBe("Pull request not confirmed");
  });

  it("gives each server code a different heading", () => {
    const codes: CategoriesProposalError[] = [
      "not-configured",
      "categories-unreadable",
      "no-usable-origin",
      "no-answer",
      "list-empty",
      "list-too-large",
      "list-unchanged",
      "proposed-by-other",
      "request-unchanged",
      "proposal-changed",
      "push-elsewhere",
      "promote-failed",
      "promote-in-progress",
    ];
    const headings = codes.map(
      (code) =>
        pullRequestNotice(new HttpError(409, "", code), 45, null)?.label,
    );
    expect(new Set(headings).size).toBe(codes.length);
  });
});
