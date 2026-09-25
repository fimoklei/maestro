import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { request, rowsOf, useHarnessStages } from "../helpers/harness-stages";

describe("harness stages over HTTP", { timeout: 40_000 }, () => {
  const stages = useHarnessStages();
  const {
    writeSkill,
    makeApp,
    refresh,
    promote,
    proposalAction,
    branchTree,
    answer,
  } = stages;

  describe("proposal actions", () => {
    it("opens a pull request over the branch Propose change pushed", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");

      expect((await promote(app, "tdd")).status).toBe(200);

      expect(stages.review.created).toEqual([
        {
          head: "maestro/tdd",
          base: "main",
          title: "Promote skill: tdd",
          body: "Proposed from the Maestro cockpit.",
        },
      ]);
    });

    it("sends an update to the same proposal, leaving GitHub's request alone", async () => {
      const app = makeApp();
      await writeSkill("tdd", "first change");
      await promote(app, "tdd");
      const first = await branchTree("tdd");
      answer([request({ decision: "changes-requested" })]);
      stages.review.created.length = 0;
      await writeSkill("tdd", "answering the review");

      expect((await promote(app, "tdd")).status).toBe(200);

      // No second request opened, so GitHub's verdict stands (#827).
      expect(await branchTree("tdd")).not.toBe(first);
      expect(stages.review.created).toEqual([]);
      const state = await refresh(app);
      expect(rowsOf(state.stages.review)).toMatchObject([
        { status: "changes-requested", requests: [{ number: 45 }] },
      ]);
    });

    it("creates the missing request from the prepared branch, without newer edits", async () => {
      const app = makeApp();
      await writeSkill("tdd", "prepared for review");
      await promote(app, "tdd");
      const prepared = await branchTree("tdd");
      stages.review.created.length = 0;
      // Create pull request must not carry later edits along (#827).
      await writeSkill("tdd", "not sent yet");

      const response = await proposalAction(app, "create", { name: "tdd" });

      expect(response.status).toBe(200);
      expect(stages.review.created).toEqual([
        {
          head: "maestro/tdd",
          base: "main",
          title: "Promote skill: tdd",
          body: "Proposed from the Maestro cockpit.",
        },
      ]);
      expect(await branchTree("tdd")).toBe(prepared);
    });

    it("refuses to create a second request over a branch that already has one", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([request()]);
      stages.review.created.length = 0;

      const response = await proposalAction(app, "create", { name: "tdd" });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "request-exists" });
      expect(stages.review.created).toEqual([]);
    });

    it("reopens the closed proposal the row named", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([request({ state: "closed" })]);

      const response = await proposalAction(app, "reopen", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(200);
      expect(stages.review.reopened).toEqual([45]);
    });

    it("refuses to reopen a merged request on a reused branch", async () => {
      // An old merged request says nothing about content pushed since.
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([request({ state: "merged" })]);

      const response = await proposalAction(app, "reopen", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "request-gone" });
      expect(stages.review.reopened).toEqual([]);
    });

    it("withdraws the open proposal, keeping the branch and the local files", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      const prepared = await branchTree("tdd");
      answer([request()]);

      const response = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(200);
      expect(stages.review.closed).toEqual([45]);
      expect(await branchTree("tdd")).toBe(prepared);
      await expect(
        readFile(
          join(stages.root, ".apm", "skills", "tdd", "SKILL.md"),
          "utf8",
        ),
      ).resolves.toContain("edited on disk");
    });

    it("blocks update and withdrawal while two requests match the branch", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      const prepared = await branchTree("tdd");
      answer([request({ number: 41 }), request({ number: 44 })]);
      await writeSkill("tdd", "a further edit");

      const update = await promote(app, "tdd");
      const withdrawal = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 41,
      });

      expect(await update.json()).toEqual({ error: "extra-requests" });
      expect(await withdrawal.json()).toEqual({ error: "extra-requests" });
      expect(await branchTree("tdd")).toBe(prepared);
      expect(stages.review.closed).toEqual([]);
    });

    it("refuses a number the fresh read no longer matches to this skill", async () => {
      // The browser's picture is a claim: GitHub is re-read before closing (#827).
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([request({ number: 44 })]);

      const response = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(409);
      expect(stages.review.closed).toEqual([]);
    });

    it("acts on no request opened from another head or into another base", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([
        request({ headOwner: "someone-else" }),
        request({ number: 46, headOwner: null, headRepo: null }),
        request({ number: 47, baseBranch: "release" }),
      ]);

      const response = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 45,
      });

      expect(await response.json()).toEqual({ error: "request-gone" });
      expect(stages.review.closed).toEqual([]);
    });

    it("acts on a teammate's request over the same branch", async () => {
      // The branch and the base make a request this Harness's (#825).
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([request({ reviewers: [{ kind: "user", login: "ada" }] })]);

      const response = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(200);
      expect(stages.review.closed).toEqual([45]);
    });

    it("refuses every mutation while GitHub cannot be asked", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      stages.review.answer({ outcome: "unavailable" });

      const created = await proposalAction(app, "create", { name: "tdd" });
      const closed = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 45,
      });

      expect(await created.json()).toEqual({ error: "review-unavailable" });
      expect(await closed.json()).toEqual({ error: "review-unavailable" });
    });

    it("states GitHub's refusal without a word of its own output", async () => {
      const app = makeApp();
      await writeSkill("tdd", "edited on disk");
      await promote(app, "tdd");
      answer([request({ state: "closed" })]);
      stages.review.answerWrite({ ok: false, error: "failed" });

      const response = await proposalAction(app, "reopen", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error: "action-failed" });
    });

    it("refuses a body that does not carry a request number", async () => {
      const app = makeApp();

      const response = await proposalAction(app, "withdraw", { name: "tdd" });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid-body" });
    });
  });
});
