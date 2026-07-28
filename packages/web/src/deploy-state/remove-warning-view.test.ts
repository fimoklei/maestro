import { describe, expect, it } from "vitest";
import { removeWarningView } from "./remove-warning-view";

describe("removeWarningView", () => {
  it("says local edits will be lost when the copy diverged", () => {
    expect(
      removeWarningView({
        data: {
          warning: "local-edits-will-be-lost",
          reclaim: null,
        },
        isPending: false,
        isError: false,
      }),
    ).toBe("local-edits");
  });

  it("keeps an unverifiable copy in its own state", () => {
    expect(
      removeWarningView({
        data: {
          warning: "cannot-verify-local-edits",
          reclaim: null,
        },
        isPending: false,
        isError: false,
      }),
    ).toBe("cannot-verify");
  });

  it("warns about nothing once the check came back clean", () => {
    expect(
      removeWarningView({
        data: { warning: null, reclaim: null },
        isPending: false,
        isError: false,
      }),
    ).toBe("none");
  });

  it("reports a check still in flight as checking, never as clean", () => {
    expect(
      removeWarningView({ data: undefined, isPending: true, isError: false }),
    ).toBe("checking");
  });

  it("says a check that failed did not run, never that it found nothing", () => {
    // J04, applied to consent: a check that could not run proves nothing about
    // what the removal would destroy. It gets its own state, because borrowing
    // the no-baseline wording would claim a cause nothing observed.
    expect(
      removeWarningView({ data: undefined, isPending: false, isError: true }),
    ).toBe("check-failed");
  });

  it("passes a check the server could not run through as its own state", () => {
    expect(
      removeWarningView({
        data: {
          warning: "check-did-not-run",
          reclaim: null,
        },
        isPending: false,
        isError: false,
      }),
    ).toBe("check-failed");
  });
});
