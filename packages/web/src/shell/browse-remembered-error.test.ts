import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { isRememberedFolderUnreachable } from "./browse-remembered-error";

describe("isRememberedFolderUnreachable", () => {
  it("is true for a not-found HttpError", () => {
    expect(
      isRememberedFolderUnreachable(new HttpError(404, "gone", "not-found")),
    ).toBe(true);
  });

  it("is true for an outside-root HttpError", () => {
    expect(
      isRememberedFolderUnreachable(
        new HttpError(403, "denied", "outside-root"),
      ),
    ).toBe(true);
  });

  it("is false for a folder that exists but could not be read", () => {
    expect(
      isRememberedFolderUnreachable(new HttpError(403, "denied", "unreadable")),
    ).toBe(false);
  });

  it("is false for an HttpError without a code", () => {
    expect(isRememberedFolderUnreachable(new HttpError(500, "broke"))).toBe(
      false,
    );
  });

  it("is false for a non-HttpError value", () => {
    expect(isRememberedFolderUnreachable(new Error("network down"))).toBe(
      false,
    );
    expect(isRememberedFolderUnreachable(undefined)).toBe(false);
  });
});
