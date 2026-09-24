import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HarnessGitAdapter } from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  git,
  type HarnessStagesApp,
  request,
  rowsOf,
  useHarnessStages,
} from "../helpers/harness-stages";

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

  // A deletion is the same journey as a change: the same stages, the same
  // recovery actions, and no shortcut past review (#847).
  describe("a deletion through the journey", () => {
    const deletion = (
      app: HarnessStagesApp,
      name: string,
      seenRemoteTree: string,
    ) =>
      app.request("/api/harness/promote/deletion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, seenRemoteTree }),
      });

    const primitiveNames = async (app: HarnessStagesApp): Promise<string[]> => {
      const body = (await (
        await app.request("/api/inventory/primitives")
      ).json()) as { primitives: { name: string }[] };
      return body.primitives.map((each) => each.name);
    };

    // Deletes the skill from the working tree only: local HEAD still tracks it,
    // which is what makes this a deletion rather than a skill that was never here.
    const deleteOnDisk = async (name: string) =>
      await rm(join(stages.root, ".apm", "skills", name), {
        recursive: true,
        force: true,
      });

    // Takes the deletion all the way to an open request, the state the
    // restoration and withdrawal cases below start from.
    const proposeDeletion = async (app: HarnessStagesApp) => {
      await deleteOnDisk("tdd");
      const before = await refresh(app);
      const [proposed] = rowsOf(before.stages.proposal);
      const response = await deletion(app, "tdd", proposed?.remoteTree ?? "");
      expect(response.status).toBe(200);
      answer([request()]);
      return proposed;
    };

    it("moves a local deletion into review as a deletion of its own", async () => {
      const app = makeApp();

      const proposed = await proposeDeletion(app);

      expect(proposed).toMatchObject({
        status: "deleted-locally",
        deletion: true,
      });
      expect(stages.review.created).toEqual([
        {
          head: "maestro/tdd",
          base: "main",
          title: "Promote skill: tdd",
          body: "Proposed from the Maestro cockpit.",
        },
      ]);
      const state = await refresh(app);
      // The work left Pending proposal for Pending review, as an edit does.
      expect(rowsOf(state.stages.proposal)).toEqual([]);
      expect(rowsOf(state.stages.review)).toMatchObject([
        { skill: "tdd", status: "waiting-for-review", deletion: true },
      ]);
    });

    it("sends a restored skill to the same proposal through Update proposal", async () => {
      const app = makeApp();
      await proposeDeletion(app);
      stages.review.created.length = 0;
      // The author changes their mind and puts the skill back.
      await writeSkill("tdd", "as published");

      const waiting = await refresh(app);
      expect(rowsOf(waiting.stages.proposal)).toMatchObject([
        { skill: "tdd", status: "new-local-work", deletion: false },
      ]);

      expect((await promote(app, "tdd")).status).toBe(200);

      // The same branch carries the skill again, and no second request opened.
      expect(stages.review.created).toEqual([]);
      const state = await refresh(app);
      expect(rowsOf(state.stages.proposal)).toEqual([]);
      expect(rowsOf(state.stages.review)).toMatchObject([
        { skill: "tdd", status: "waiting-for-review", deletion: false },
      ]);
    });

    it("withdraws a deletion proposal the way it withdraws a change", async () => {
      const app = makeApp();
      await proposeDeletion(app);

      const response = await proposalAction(app, "withdraw", {
        name: "tdd",
        number: 45,
      });

      expect(response.status).toBe(200);
      expect(stages.review.closed).toEqual([45]);
      // The branch and the local deletion both stand: withdrawing closes the
      // request, never the author's work.
      expect(await branchTree("tdd")).toBeTruthy();
    });

    it("blocks a deletion where two requests match the branch", async () => {
      const app = makeApp();
      await deleteOnDisk("tdd");
      const before = await refresh(app);
      answer([request({ number: 41 }), request({ number: 44 })]);

      const response = await deletion(
        app,
        "tdd",
        rowsOf(before.stages.proposal)[0]?.remoteTree ?? "",
      );

      expect(await response.json()).toEqual({ error: "extra-requests" });
      expect(stages.review.created).toEqual([]);
    });

    it("drops the Inventory row once the deletion is released, leaving deployed copies alone", async () => {
      const app = makeApp();
      // A consuming repo with a deployed copy of the skill, known to Maestro.
      const consumer = join(stages.base, "consumer");
      const deployed = join(consumer, ".claude", "skills", "tdd", "SKILL.md");
      await mkdir(join(consumer, ".claude", "skills", "tdd"), {
        recursive: true,
      });
      await mkdir(join(consumer, ".git"));
      await writeFile(deployed, "deployed copy\n", "utf8");
      expect(
        (
          await app.request("/api/registry/repos", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ path: consumer }),
          })
        ).status,
      ).toBe(201);
      expect(await primitiveNames(app)).toEqual(["tdd"]);

      // The deletion merges onto the default branch.
      await deleteOnDisk("tdd");
      await git(stages.root, "add", "-A");
      await git(stages.root, "commit", "-m", "delete tdd");
      await git(stages.root, "push", "origin", "HEAD:main");
      await new HarnessGitAdapter().fetch(stages.root);

      const merged = await refresh(app);
      expect(rowsOf(merged.stages.release)).toMatchObject([
        { skill: "tdd", status: "deleted", deletion: true },
      ]);
      // Merged is not released: Inventory still ships what v0.1.0 published.
      expect(await primitiveNames(app)).toEqual(["tdd"]);

      await git(stages.root, "tag", "v0.2.0");
      await git(stages.root, "push", "--tags", "origin", "HEAD:main");
      await new HarnessGitAdapter().fetch(stages.root);

      const released = await refresh(app);
      expect(await primitiveNames(app)).toEqual([]);
      expect(rowsOf(released.stages.release)).toEqual([]);
      // Releasing publishes; it never reaches into a consuming repo.
      await expect(readFile(deployed, "utf8")).resolves.toBe("deployed copy\n");
    });
  });
});
