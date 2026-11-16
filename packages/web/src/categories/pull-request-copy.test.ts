import type { CategoriesProposalError } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { plainText } from "../ui/phrase";
import {
  ADDED_TO_HARNESS,
  COMPARED_WITH_NEXT_RELEASE,
  CREATE_PULL_REQUEST_BODY,
  DELETED_FROM_HARNESS,
  MOVED_TO_ANOTHER_CATEGORY,
  NEXT_RELEASE_UNREADABLE,
  PULL_REQUEST_NOT_OPENED,
  PULL_REQUEST_ROW,
  pullRequestDeletes,
  pullRequestNotice,
  pullRequestRow,
  SAME_AS_NEXT_RELEASE,
  VIEW_ON_HARNESS,
} from "./pull-request-copy";

const PULL = "https://github.com/fimoklei/agent-harness/pull";

// Approved sentences, as exact strings.
describe("the pull-request row", () => {
  it("names the row and its link", () => {
    expect(PULL_REQUEST_ROW).toBe("Pull request to the Harness");
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
      },
      "Pull request #45 is open and waiting for a reviewer. Select Update pull request to send your current categories.",
      null,
    ],
    [
      {
        state: "own-open",
        status: "changes-requested",
        number: 45,
        url: `${PULL}/45`,
      },
      "A reviewer asked for changes on pull request #45. Change your categories, then select Update pull request to send them.",
      null,
    ],
  ])("states %j", (row, sentence, blocked) => {
    const view = pullRequestRow(row);
    expect(plainText(view.sentence)).toBe(sentence);
    expect(view.blocked).toBe(blocked);
  });
});

describe("the Create pull request dialog", () => {
  it("states what the pull request does and what stays", () => {
    expect(CREATE_PULL_REQUEST_BODY).toBe(
      "This creates a pull request on GitHub that replaces the Harness categories with your list. A curator reviews it and decides whether to merge it. Your categories stay as they are.",
    );
    expect(COMPARED_WITH_NEXT_RELEASE).toBe("Compared with the next release");
    expect(ADDED_TO_HARNESS).toBe("Added to the Harness");
    expect(DELETED_FROM_HARNESS).toBe("Deleted from the Harness");
    expect(MOVED_TO_ANOTHER_CATEGORY).toBe("Moved to another category");
  });

  it("warns of the Harness categories it deletes and the items they leave", () => {
    const warning = pullRequestDeletes([
      { name: "Debugging", skills: 1, prompts: 2 },
      { name: "Release", skills: 1, prompts: 0 },
      { name: "Review", skills: 1, prompts: 0 },
      { name: "Writing", skills: 0, prompts: 0 },
    ]);
    expect(warning.level).toBe("warning");
    expect(warning.label).toBe(
      "This pull request deletes 4 Harness categories",
    );
    expect(plainText(warning.message)).toBe(
      "Once it is merged, 3 skills and 2 prompts in Debugging, Release, Review and Writing have no category in the Harness.",
    );
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
    expect(pullRequestNotice(new TypeError("fetch failed"))).toMatchObject({
      label: "Pull request not confirmed",
      message:
        "The Maestro server did not respond, so the pull request may already be open. Select Close, then check the Harness screen.",
    });
  });

  it("reports a failed push", () => {
    expect(
      pullRequestNotice(new HttpError(502, "", "promote-failed")),
    ).toMatchObject({
      label: "Pull request not created",
      message:
        "Your categories stay as they are. Select Close, then select Create pull request again.",
    });
  });

  it("reports a pushed branch without a pull request", () => {
    expect(PULL_REQUEST_NOT_OPENED.label).toBe("Pull request not opened");
    expect(plainText(PULL_REQUEST_NOT_OPENED.message)).toBe(
      "Maestro pushed your categories to the branch maestro/list.categories, but GitHub opened no pull request. Select Close, then check the Harness screen.",
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
    "request-exists",
    "push-elsewhere",
    "promote-failed",
    "promote-in-progress",
  ])("gives %s its own heading", (code) => {
    const heading = pullRequestNotice(new HttpError(409, "", code))?.label;
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
      "request-exists",
      "push-elsewhere",
      "promote-failed",
      "promote-in-progress",
    ];
    const headings = codes.map(
      (code) => pullRequestNotice(new HttpError(409, "", code))?.label,
    );
    expect(new Set(headings).size).toBe(codes.length);
  });
});
