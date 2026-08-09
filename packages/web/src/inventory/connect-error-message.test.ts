import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { connectErrorCode, scaffoldOfferPath } from "./connect-error-message";

const refusal = (code: string, body?: unknown) =>
  new HttpError(422, "message", code, body);

describe("scaffoldOfferPath", () => {
  it("reads the path the scaffoldable refusal carried", () => {
    expect(
      scaffoldOfferPath(
        refusal("scaffoldable", { error: "scaffoldable", path: "/home/me/r" }),
      ),
    ).toBe("/home/me/r");
  });

  it("offers nothing for any other refusal", () => {
    expect(
      scaffoldOfferPath(refusal("not-an-inventory", { path: "/home/me/r" })),
    ).toBeNull();
  });

  it("offers nothing when the body carries no usable path", () => {
    for (const body of [undefined, {}, { path: "" }, { path: 7 }]) {
      expect(scaffoldOfferPath(refusal("scaffoldable", body))).toBeNull();
    }
  });

  it("offers nothing for an error that is not an HTTP refusal", () => {
    expect(scaffoldOfferPath(new Error("scaffoldable"))).toBeNull();
    expect(scaffoldOfferPath(null)).toBeNull();
  });

  it("does not confuse the offer with a no-usable-origin refusal", () => {
    const offer = refusal("scaffoldable", { path: "/home/me/r" });
    expect(connectErrorCode(offer)).toBe("scaffoldable");
    expect(scaffoldOfferPath(refusal("no-usable-origin"))).toBeNull();
  });
});
