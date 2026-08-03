import type { RemoveToolCheck, RemoveWarning } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { removePreflightView } from "./remove-preflight-view";
import type { RemovePreflight } from "./use-remove-preflight";

// The shape every case starts from: a settled, successful query. Each test
// changes only the field it is about, so the reason it passes is visible.
const answered = {
  data: undefined,
  error: null,
  fetchStatus: "idle" as const,
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
  describe("when the repo scope answered", () => {
    const repoAnswer = (warning: RemoveWarning | null) =>
      removePreflightView({
        ...answered,
        data: { check: { scope: "repo", warning }, reclaim: null },
      });

    it("says local edits will be lost when the copy diverged", () => {
      expect(repoAnswer("local-edits-will-be-lost")).toEqual({
        kind: "offered",
        check: { kind: "repo", warning: "local-edits" },
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

  // The global scope answers per detected tool, so the dialog can state a cost
  // on the row that carries it rather than over the whole set (#414).
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
          { tool: "codex", warning: "local-edits-will-be-lost" },
        ]),
      ).toEqual({
        kind: "offered",
        check: {
          kind: "per-tool",
          warnings: { claude: "none", codex: "local-edits" },
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

  // Nothing validates the response body, so a server one version away sends a
  // 200 this build cannot read. Every one of those has to land on the state
  // that says so — a render that throws takes the whole confirmation down in
  // front of an irreversible action, and reading it as clean is worse (J04).
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

  // Every unsettled check, whatever else is in hand. The last three are the
  // ones a reopened confirmation hits: an earlier answer or an earlier failure
  // is still there while the fresh check runs, and reporting either would price
  // this removal from the last one — reclaim token included (#381).
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

    // A refetch after a failure keeps isError true. Reading the failure first
    // would offer a confirm the previous answer's token could still price.
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

    // Paused offline: nothing is in flight, and nothing has answered either.
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

  // A failed refetch keeps the previous data; carrying it through would name
  // paths for deletion under a "removal cannot run" message.
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
      ).toEqual({
        kind: "offered",
        check: { kind: "unanswered", warning: "check-failed" },
        reclaim: [],
      });
    });
  });

  describe("when the check itself failed", () => {
    // A failed request carries no per-tool answers, so the one state it reports
    // is true of every row at once — and it is never a clean one (J04).
    const failedCheck = {
      kind: "offered",
      check: { kind: "unanswered", warning: "check-failed" },
      reclaim: [],
    };

    it("says it did not run, never that it found nothing", () => {
      // J04, applied to consent: a check that could not run proves nothing about
      // what the removal would destroy. It gets its own state, because borrowing
      // the no-baseline wording would claim a cause nothing observed.
      expect(failedView(new Error("network down"))).toEqual(failedCheck);
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
      ).toEqual(failedCheck);
    });

    it("treats an unrecognised server code as a check that could not run", () => {
      // An allowlist, never a blocklist: a code this build has never heard of
      // says nothing about whether the removal can succeed.
      expect(
        failedView(new HttpError(500, "Something went wrong.", "who-knows")),
      ).toEqual(failedCheck);
    });

    it("treats an error the server sent no code with the same way", () => {
      // A proxy page or a crash mid-request arrives as an HttpError with no
      // code at all.
      expect(failedView(new HttpError(502, "Bad gateway"))).toEqual(
        failedCheck,
      );
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
      // The code travels beside the wording: the bulk dialog names a refusal
      // in a right-aligned slot a full sentence does not fit, and the run is
      // told which refusal it was (#423).
      it(`carries the server's own wording and code for ${code}`, () => {
        expect(failedView(new HttpError(403, message, code))).toEqual({
          kind: "refused",
          code,
          message,
        });
      });
    }
  });
});
