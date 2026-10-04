// Discard change returns a Not yet proposed folder to its default-branch copy (#1375).
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HarnessGitAdapter, NodeFileSystem } from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  git,
  type HarnessStagesApp,
  rowsOf,
  useHarnessStages,
} from "../helpers/harness-stages";

describe("Discard change over HTTP", { timeout: 40_000 }, () => {
  const stages = useHarnessStages();
  const { writeSkill, makeApp, refresh } = stages;

  const folder = (...parts: string[]) =>
    join(stages.root, ".apm", "skills", ...parts);

  const discard = (app: HarnessStagesApp, body: unknown) =>
    app.request("/api/harness/skill/discard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const trees = async () => {
    const read = await new HarnessGitAdapter().readMovementTrees(stages.root);
    if (read === null) {
      throw new Error("the clone's trees are unreadable");
    }
    return read;
  };

  // The tree the row offers, as the dialog confirms it.
  const seenRemoteTree = async (app: HarnessStagesApp) => {
    const row = rowsOf((await refresh(app)).stages.proposal).find(
      (each) => each.skill === "tdd",
    );
    if (row?.status !== "not-yet-proposed" || row.remoteTree === null) {
      throw new Error("tdd is not waiting as Not yet proposed");
    }
    return row.remoteTree;
  };

  // Changed, added and removed files, beside another skill's own edit.
  const editTdd = async () => {
    await writeSkill("tdd", "edited, not proposed");
    await writeFile(folder("tdd", "added.md"), "added\n", "utf8");
    await writeSkill("scratch", "another skill's edit");
  };

  it("replaces every file of the skill, leaves the other skill's edit, and the row leaves Pending proposal", async () => {
    const app = makeApp();
    await writeFile(folder("tdd", "kept.md"), "kept\n", "utf8");
    await git(stages.root, "add", ".");
    await git(stages.root, "commit", "-m", "second file");
    await git(stages.root, "push", "origin", "HEAD:main");
    await editTdd();
    await rm(folder("tdd", "kept.md"));
    const seen = await seenRemoteTree(app);

    const response = await discard(app, { name: "tdd", seenRemoteTree: seen });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "tdd" });
    const after = await trees();
    expect(after.working.tdd).toBe(after.remote.tdd);
    expect(await readFile(folder("tdd", "kept.md"), "utf8")).toBe("kept\n");
    expect(await new NodeFileSystem().exists(folder("tdd", "added.md"))).toBe(
      false,
    );
    expect(await readFile(folder("scratch", "SKILL.md"), "utf8")).toContain(
      "another skill's edit",
    );
    const rows = rowsOf((await stages.read(app)).stages.proposal);
    expect(rows.map((row) => row.skill)).toEqual(["scratch"]);
  });

  it.each([
    ["as proposed", false],
    ["edited again after proposing", true],
  ])(
    "refuses once a proposal branch exists, with the folder %s",
    async (_, editedAgain) => {
      const app = makeApp();
      await editTdd();
      const seen = await seenRemoteTree(app);
      await git(stages.root, "add", ".apm/skills/tdd");
      await git(stages.root, "commit", "-m", "proposed change");
      await git(stages.root, "push", "origin", "HEAD:refs/heads/maestro/tdd");
      await git(stages.root, "reset", "HEAD~1");
      if (editedAgain) {
        await writeSkill("tdd", "edited after proposing");
      }
      await refresh(app);
      const before = (await trees()).working.tdd;

      const response = await discard(app, {
        name: "tdd",
        seenRemoteTree: seen,
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "already-proposed" });
      expect((await trees()).working.tdd).toBe(before);
    },
  );

  it("refuses a confirmation given against another default-branch copy", async () => {
    const app = makeApp();
    await editTdd();
    await seenRemoteTree(app);
    const before = (await trees()).working.tdd;

    const response = await discard(app, {
      name: "tdd",
      seenRemoteTree: "0000000000000000000000000000000000000000",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "confirmation-stale" });
    expect((await trees()).working.tdd).toBe(before);
  });
});
