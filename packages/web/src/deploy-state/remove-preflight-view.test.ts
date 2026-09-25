import type { RemoveToolCheck, RemoveWarning } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { removeNotice } from "./notice-copy";
import { removePreflightView } from "./remove-preflight-view";
import type { RemovePreflight } from "./use-remove-preflight";

const answered = {
  data: undefined,
  error: null,
  fetchStatus: "idle" as const,
  isError: false,
};

const failedView = (error: unknown) =>
  removePreflightView({ ...answered, error, isError: true });

const RECLAIMED = {
  previews: [{ tool: "claude" as const, path: "/Users/me/.claude/skills/tdd" }],
  token: "a".repeat(64),
};

describe("removePreflightView", () => {
  describe("when the repo scope answered", () => {
    const repoAnswer = (warning: RemoveWarning | null) =>
      removePreflightView({
        ...answered,
        data: { check: { scope: "repo", warning }, reclaim: null },
      });

    it("says the copy cannot be verified when it has no baseline", () => {
      expect(repoAnswer("cannot-verify-local-edits")).toEqual({
        kind: "offered",
        check: { kind: "repo", warning: "cannot-verify" },
        reclaim: [],
      });
    });

    it("keeps an unverifiable copy in its own state", () => {
      expect(repoAnswer("cannot-verify-local-edits")).toEqual({
        kind: "offered",
        check: { kind: "repo", warning: "cannot-verify" },
        reclaim: [],
      });
    });

    it("warns about nothing once the check came back clean", () => {
      expect(repoAnswer(null)).toEqual({
        kind: "offered",
        check: { kind: "repo", warning: "none" },
        reclaim: [],
      });
    });

    it("passes a check the server could not run through as its own state", () => {
      expect(repoAnswer("check-did-not-run")).toEqual({
        kind: "offered",
        check: { kind: "repo", warning: "check-failed" },
        reclaim: [],
      });
    });
  });

  describe("when the global scope answered", () => {
    const globalAnswer = (
      tools: RemoveToolCheck[],
      reclaim: RemovePreflight["reclaim"] = null,
    ) =>
      removePreflightView({
        ...answered,
        data: { check: { scope: "global", tools }, reclaim },
      });

    it("keeps each tool's answer against that tool's own name", () => {
      expect(
        globalAnswer([
          { tool: "claude", warning: null },
          { tool: "codex", warning: "cannot-verify-local-edits" },
        ]),
      ).toEqual({
        kind: "offered",
        check: {
          kind: "per-tool",
          warnings: { claude: "none", codex: "cannot-verify" },
        },
        reclaim: [],
      });
    });

    it("keeps a tool that could not be checked apart from a clean one", () => {
      expect(
        globalAnswer([
          { tool: "claude", warning: "check-did-not-run" },
          { tool: "codex", warning: "cannot-verify-local-edits" },
        ]),
      ).toEqual({
        kind: "offered",
        check: {
          kind: "per-tool",
          warnings: { claude: "check-failed", codex: "cannot-verify" },
        },
        reclaim: [],
      });
    });

    it("carries the leftover copies that answer names", () => {
      expect(
        globalAnswer([{ tool: "codex", warning: null }], RECLAIMED),
      ).toEqual({
        kind: "offered",
        check: { kind: "per-tool", warnings: { codex: "none" } },
        reclaim: RECLAIMED.previews,
      });
    });
  });

  // Nothing validates the response body: an unreadable 200 must neither throw
  // nor read as clean.
  describe("when a 200 carries a body this build cannot read", () => {
    const unreadable = (data: unknown) =>
      removePreflightView({
        ...answered,
        data: data as RemovePreflight,
      });
    const failedCheck = {
      kind: "offered",
      check: { kind: "unanswered", warning: "check-failed" },
      reclaim: [],
    };

    it("fails closed on an answer with no check in it", () => {
      expect(unreadable({ reclaim: null })).toEqual(failedCheck);
    });

    it("fails closed on a scope this build has never heard of", () => {
      expect(
        unreadable({ check: { scope: "per-machine" }, reclaim: null }),
      ).toEqual(failedCheck);
    });

    it("fails closed on a global answer carrying no tool list", () => {
      expect(
        unreadable({ check: { scope: "global", tools: null }, reclaim: null }),
      ).toEqual(failedCheck);
    });

    it("fails closed on a body that is not an object at all", () => {
      expect(unreadable(null)).toEqual(failedCheck);
      expect(unreadable("nope")).toEqual(failedCheck);
    });
  });

  describe("while a check has not settled", () => {
    const checking = {
      kind: "offered",
      check: { kind: "unanswered", warning: "checking" },
      reclaim: [],
    };
    const cached = {
      check: { scope: "repo", warning: null },
      reclaim: RECLAIMED,
    } as const;

    it("reports nothing yet known as checking, never as clean", () => {
      expect(
        removePreflightView({ ...answered, fetchStatus: "fetching" }),
      ).toEqual(checking);
    });

    it("reports a cached answer as checking, not as this removal's", () => {
      expect(
        removePreflightView({
          ...answered,
          data: cached,
          fetchStatus: "fetching",
        }),
      ).toEqual(checking);
    });

    it("reports a refetch after a failure as checking, not as failed", () => {
      expect(
        removePreflightView({
          ...answered,
          data: cached,
          error: new Error("network"),
          isError: true,
          fetchStatus: "fetching",
        }),
      ).toEqual(checking);
    });

    it("reports a paused check as checking, however long it waits", () => {
      expect(
        removePreflightView({
          ...answered,
          data: cached,
          fetchStatus: "paused",
        }),
      ).toEqual(checking);
    });
  });

  describe("when an earlier answer is still in hand", () => {
    const stale: RemovePreflight = {
      check: { scope: "repo", warning: null },
      reclaim: RECLAIMED,
    };

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
        code: "repo-not-registered",
        notice: removeNotice(
          new HttpError(403, "unused", "repo-not-registered"),
        ),
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
      ).toEqual({
        kind: "offered",
        check: { kind: "unanswered", warning: "check-failed" },
        reclaim: [],
      });
    });
  });

  describe("when the check itself failed", () => {
    const failedCheck = {
      kind: "offered",
      check: { kind: "unanswered", warning: "check-failed" },
      reclaim: [],
    };

    it("says it did not run, never that it found nothing", () => {
      expect(failedView(new Error("network down"))).toEqual(failedCheck);
    });

    it("keeps the removal on offer when the server tried and could not answer", () => {
      // preflight-failed settles nothing about the removal, so it must not take the confirm away.
      expect(
        failedView(
          new HttpError(
            502,
            "Maestro could not check the deployed copy for local changes.",
            "preflight-failed",
          ),
        ),
      ).toEqual(failedCheck);
    });

    it("treats an unrecognised server code as a check that could not run", () => {
      expect(
        failedView(new HttpError(500, "Something went wrong.", "who-knows")),
      ).toEqual(failedCheck);
    });

    it("treats an error the server sent no code with the same way", () => {
      expect(failedView(new HttpError(502, "Bad gateway"))).toEqual(
        failedCheck,
      );
    });
  });

  describe("when the server refused the request", () => {
    const refusals = [
      "repo-not-registered",
      "no-supported-tool",
      "invalid-name",
      "unsupported-primitive-type",
    ] as const;

    for (const code of refusals) {
      it(`carries the copy module's notice and the code for ${code}`, () => {
        const error = new HttpError(403, "sent by the server", code);
        expect(failedView(error)).toEqual({
          kind: "refused",
          code,
          notice: removeNotice(error),
        });
      });
    }

    it("passes the request-shape message through for invalid-body", () => {
      const message = "Expected a JSON body with type, name, and target.";
      expect(failedView(new HttpError(400, message, "invalid-body"))).toEqual({
        kind: "refused",
        code: "invalid-body",
        notice: {
          level: "error",
          label: "Maestro could not start the action",
          message,
        },
      });
    });
  });
});
