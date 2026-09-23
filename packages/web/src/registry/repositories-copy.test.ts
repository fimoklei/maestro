import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import {
  EMPTY_SENTENCE,
  EMPTY_TITLE,
  FOLDER_HINT,
  registerMessage,
  STATUS_READINGS,
  unregisterNotice,
} from "./repositories-copy";

const refusal = (code: string, status = 400) =>
  new HttpError(status, "ignored", code);

// Approved sentences, as exact strings (copy.md). The refusals are #1009's:
// each is stated under the folder field right after the pick.
describe("registerMessage", () => {
  it("names a repository already on the list", () => {
    expect(registerMessage(refusal("already-registered"))).toBe(
      "Already registered.",
    );
  });

  it("refuses a folder without Git", () => {
    expect(registerMessage(refusal("not-a-git-repo"))).toBe(
      "Not a Git repository. Register a valid repository.",
    );
  });

  it("separates the Harness from the repositories it deploys to", () => {
    expect(registerMessage(refusal("central-inventory"))).toBe(
      "This is the Harness, not a valid target. Register a repository.",
    );
  });

  // Rewritten with the browse listing's retirement (#1046): the reader's next
  // move is the same whether nothing is there or a file is.
  it("sends a path that is missing or names a file back to another pick", () => {
    expect(registerMessage(refusal("not-found"))).toBe(
      "Not a valid path. Pick another folder.",
    );
    expect(registerMessage(refusal("not-a-directory"))).toBe(
      "Not a valid path. Pick another folder.",
    );
  });

  it("asks for an absolute path when none was sent", () => {
    expect(registerMessage(refusal("missing"))).toBe(
      "Enter the repository's absolute path.",
    );
  });

  it("shows what an absolute path looks like", () => {
    expect(registerMessage(refusal("relative"))).toBe(
      "Enter the repository's absolute path, for example /Users/name/code/my-repo.",
    );
  });

  it("keeps the server's own words for a request the server could not read", () => {
    expect(
      registerMessage(
        new HttpError(
          400,
          "No path reached the server. Reload the page, then name the folder again.",
          "invalid-body",
          { detail: "The request carries a path: { path: string }." },
        ),
      ),
    ).toBe(
      "No path reached the server. Reload the page, then name the folder again.",
    );
  });

  it("never renders the wrapper's own status line for an uncovered code", () => {
    expect(
      registerMessage(new HttpError(500, "Request failed with status 500.")),
    ).toBe(
      "Maestro could not register this repository. Try registering it again.",
    );
  });

  it("states the same for a failure that never reached the server", () => {
    expect(registerMessage(new TypeError("network down"))).toBe(
      "Maestro could not register this repository. Try registering it again.",
    );
  });
});

describe("the screen's own words", () => {
  it("names each reading as a word and a glyph", () => {
    expect(STATUS_READINGS).toEqual({
      ready: { word: "Ready", family: "good", glyph: "✓" },
      "folder-missing": {
        word: "Folder missing",
        family: "failed",
        glyph: "✕",
      },
      "not-a-git-repo": {
        word: "Not a Git repository",
        family: "attention",
        glyph: "⚠",
      },
    });
  });

  it("states the empty registry and what appears here", () => {
    expect(EMPTY_TITLE).toBe("No repositories yet");
    expect(EMPTY_SENTENCE).toBe(
      "The repositories you deploy skills to appear here, with the state of each folder.",
    );
  });

  it("states the field's one rule before the pick", () => {
    expect(FOLDER_HINT).toBe("Must be a Git repository.");
  });
});

describe("unregisterNotice", () => {
  it("sends a repository already gone from the list to a re-read", () => {
    expect(unregisterNotice(refusal("not-registered", 404))).toEqual({
      level: "error",
      label: "Repository not unregistered",
      message:
        "It is no longer on the list. Select Re-read Repositories to read the list again.",
    });
  });

  it("offers Unregister again for any other failure", () => {
    expect(unregisterNotice(new TypeError("network down"))).toEqual({
      level: "error",
      label: "Repository not unregistered",
      message: "The list did not change. Select Unregister to try again.",
    });
  });
});
