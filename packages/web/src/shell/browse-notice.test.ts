import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { browseNotice } from "./browse-notice";

const refusal = (code: string) => new HttpError(400, "ignored", code);

describe("browseNotice", () => {
  it("says nothing while the browse has not failed", () => {
    expect(browseNotice(null)).toBeNull();
  });

  it("sends a path outside the home folder back to the picker", () => {
    expect(browseNotice(refusal("outside-root"))).toEqual({
      level: "error",
      label: "Out of reach",
      message: "Pick a folder inside your home folder.",
      detail: "Maestro browses inside the home folder only.",
    });
  });

  it("states the folder is gone and asks for another", () => {
    expect(browseNotice(refusal("not-found"))).toEqual({
      level: "error",
      label: "No folder at that path",
      message: "Pick another folder.",
      detail: "It may have been moved or deleted since the last look.",
    });
  });

  it("names the file and asks for the folder holding it", () => {
    expect(browseNotice(refusal("not-a-directory"))).toEqual({
      level: "error",
      label: "Not a folder",
      message: "That path points at a file. Pick the folder that holds it.",
      detail: undefined,
    });
  });

  it("states the permissions and asks for another folder", () => {
    expect(browseNotice(refusal("unreadable"))).toEqual({
      level: "error",
      label: "Folder unreadable",
      message: "Pick another folder.",
      detail: "Its permissions do not allow reading.",
    });
  });

  it("falls back to the folder staying unread for a code it does not cover", () => {
    expect(browseNotice(refusal("teleported"))).toEqual({
      level: "error",
      label: "Folder not read",
      message: "The Maestro server did not answer. Pick the folder again.",
      detail: undefined,
    });
  });
});
