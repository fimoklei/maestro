import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { removePreflightView } from "./remove-preflight-view";

// The shape every case starts from: a settled, successful query. Each test
// changes only the field it is about, so the reason it passes is visible.
const answered = {
  data: undefined,
  error: null,
  isPending: false,
  isError: false,
};

const failedView = (error: unknown) =>
  removePreflightView({ ...answered, error, isError: true });

// The leftover copies a global removal would also delete, as one answered check
// reported them.
const RECLAIMED = {
  previews: [{ tool: "claude" as const, path: "/Users/me/.claude/skills/tdd" }],
  token: "a".repeat(64),
};

describe("removePreflightView", () => {
  describe("when the check answered", () => {
    it("says local edits will be lost when the copy diverged", () => {
      expect(
        removePreflightView({
          ...answered,
          data: { warning: "local-edits-will-be-lost", reclaim: null },
        }),
      ).toEqual({ kind: "warning", warning: "local-edits", reclaim: [] });
    });

    it("keeps an unverifiable copy in its own state", () => {
      expect(
        removePreflightView({
          ...answered,
          data: { warning: "cannot-verify-local-edits", reclaim: null },
        }),
      ).toEqual({ kind: "warning", warning: "cannot-verify", reclaim: [] });
    });

    it("warns about nothing once the check came back clean", () => {
      expect(
        removePreflightView({
          ...answered,
          data: { warning: null, reclaim: null },
        }),
      ).toEqual({ kind: "warning", warning: "none", reclaim: [] });
    });

    it("passes a check the server could not run through as its own state", () => {
      expect(
        removePreflightView({
          ...answered,
          data: { warning: "check-did-not-run", reclaim: null },
        }),
      ).toEqual({ kind: "warning", warning: "check-failed", reclaim: [] });
    });

    it("carries the leftover copies that answer names", () => {
      expect(
        removePreflightView({
          ...answered,
          data: { warning: null, reclaim: RECLAIMED },
        }),
      ).toEqual({
        kind: "warning",
        warning: "none",
        reclaim: RECLAIMED.previews,
      });
    });
  });

  it("reports a check still in flight as checking, never as clean", () => {
    expect(removePreflightView({ ...answered, isPending: true })).toEqual({
      kind: "warning",
      warning: "checking",
      reclaim: [],
    });
  });

  // A query keeps the previous answer's data when a later refetch fails. Carrying
  // it through would name paths the dialog is about to delete under a message
  // saying the removal cannot run — the loudest contradiction this screen can
  // make, about an irreversible action.
  describe("when an earlier answer is still in hand", () => {
    const stale = { warning: null, reclaim: RECLAIMED } as const;

    it("drops it when the next check was refused", () => {
      expect(
        removePreflightView({
          ...answered,
          data: stale,
          error: new HttpError(
            403,
            "That repo is not registered with Maestro.",
            "repo-not-registered",
          ),
          isError: true,
        }),
      ).toEqual({
        kind: "refused",
        message: "That repo is not registered with Maestro.",
      });
    });

    it("drops it when the next check could not run", () => {
      expect(
        removePreflightView({
          ...answered,
          data: stale,
          error: new Error("network down"),
          isError: true,
        }),
      ).toEqual({ kind: "warning", warning: "check-failed", reclaim: [] });
    });
  });

  describe("when the check itself failed", () => {
    it("says it did not run, never that it found nothing", () => {
      // J04, applied to consent: a check that could not run proves nothing about
      // what the removal would destroy. It gets its own state, because borrowing
      // the no-baseline wording would claim a cause nothing observed.
      expect(failedView(new Error("network down"))).toEqual({
        kind: "warning",
        warning: "check-failed",
        reclaim: [],
      });
    });

    it("keeps the removal on offer when the server tried and could not answer", () => {
      // preflight-failed is the one server error that settles nothing about
      // whether the removal can succeed, so it must not take the confirm away.
      expect(
        failedView(
          new HttpError(
            502,
            "Maestro could not check the deployed copy for local changes.",
            "preflight-failed",
          ),
        ),
      ).toEqual({ kind: "warning", warning: "check-failed", reclaim: [] });
    });

    it("treats an unrecognised server code as a check that could not run", () => {
      // An allowlist, never a blocklist: a code this build has never heard of
      // says nothing about whether the removal can succeed.
      expect(
        failedView(new HttpError(500, "Something went wrong.", "who-knows")),
      ).toEqual({ kind: "warning", warning: "check-failed", reclaim: [] });
    });

    it("treats an error the server sent no code with the same way", () => {
      // A proxy page or a crash mid-request arrives as an HttpError with no
      // code at all.
      expect(failedView(new HttpError(502, "Bad gateway"))).toEqual({
        kind: "warning",
        warning: "check-failed",
        reclaim: [],
      });
    });
  });

  describe("when the server refused the request", () => {
    // Each of these means the removal itself cannot succeed. Confirming would
    // spend a round-trip to be told the same thing, so the dialog says it now,
    // in the server's own words.
    const refusals = [
      ["repo-not-registered", "That repo is not registered with Maestro."],
      ["no-supported-tool", "There is no global deployment to remove."],
      ["invalid-name", "That skill name is not a valid slug."],
      ["unsupported-primitive-type", "Only skills can be removed for now."],
      ["invalid-body", "Expected a JSON body with type, name, and target."],
    ] as const;

    for (const [code, message] of refusals) {
      it(`carries the server's own wording for ${code}`, () => {
        expect(failedView(new HttpError(403, message, code))).toEqual({
          kind: "refused",
          message,
        });
      });
    }
  });
});
