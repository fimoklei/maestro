import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { isFolderMissing } from "./browse-remembered-error";

describe("isFolderMissing", () => {
  it("is true for a not-found HttpError", () => {
    expect(isFolderMissing(new HttpError(404, "gone", "not-found"))).toBe(true);
  });

  it("is false for other typed browse errors", () => {
    expect(isFolderMissing(new HttpError(403, "denied", "unreadable"))).toBe(
      false,
    );
    expect(isFolderMissing(new HttpError(403, "denied", "outside-root"))).toBe(
      false,
    );
  });

  it("is false for an HttpError without a code", () => {
    expect(isFolderMissing(new HttpError(500, "broke"))).toBe(false);
  });

  it("is false for a non-HttpError value", () => {
    expect(isFolderMissing(new Error("network down"))).toBe(false);
    expect(isFolderMissing(undefined)).toBe(false);
  });
});
