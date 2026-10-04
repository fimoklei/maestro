// The check the Delete skill dialog reads, then the deletion it confirms (#1380).
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NodeFileSystem, type SkillDeletionCheck } from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  type HarnessStagesApp,
  useHarnessStages,
} from "../helpers/harness-stages";

describe("Delete skill over HTTP", { timeout: 40_000 }, () => {
  const stages = useHarnessStages();
  const { writeSkill, makeApp } = stages;

  const check = async (
    app: HarnessStagesApp,
  ): Promise<Record<string, SkillDeletionCheck>> => {
    const response = await app.request("/api/harness/skill/delete/check");
    expect(response.status).toBe(200);
    return ((await response.json()) as { skills: never }).skills;
  };

  const seenTree = async (app: HarnessStagesApp, name: string) => {
    const skill = (await check(app))[name];
    if (skill?.inClone !== true) {
      throw new Error(`${name} is not in the clone`);
    }
    return skill.workingTree;
  };

  const remove = (app: HarnessStagesApp, body: unknown) =>
    app.request("/api/harness/skill/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const folderExists = (name: string) =>
    new NodeFileSystem().exists(join(stages.root, ".apm", "skills", name));

  it("reports a clean folder, one with uncommitted changes, a local-only one and one not in the clone", async () => {
    const app = makeApp();
    await writeSkill("scratch", "never proposed");

    const before = await check(app);
    await writeSkill("tdd", "edited, not committed");
    const edited = await check(app);
    await rm(join(stages.root, ".apm", "skills", "tdd"), { recursive: true });
    const deleted = await check(app);

    expect(before.tdd).toMatchObject({
      inClone: true,
      uncommitted: false,
      localOnly: false,
    });
    expect(edited.tdd).toMatchObject({ inClone: true, uncommitted: true });
    expect(edited.scratch).toMatchObject({ inClone: true, localOnly: true });
    expect(deleted.tdd).toEqual({ inClone: false });
  });

  it("deletes the folder the check was read against", async () => {
    const app = makeApp();
    await writeSkill("scratch", "never proposed");
    const seenWorkingTree = await seenTree(app, "scratch");

    const response = await remove(app, { name: "scratch", seenWorkingTree });

    expect(response.status).toBe(200);
    expect(await folderExists("scratch")).toBe(false);
  });

  it("refuses a folder that changed after the check, and leaves it", async () => {
    const app = makeApp();
    await writeSkill("scratch", "never proposed");
    const seenWorkingTree = await seenTree(app, "scratch");
    await writeFile(
      join(stages.root, ".apm", "skills", "scratch", "notes.md"),
      "written after the dialog opened\n",
      "utf8",
    );

    const response = await remove(app, { name: "scratch", seenWorkingTree });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "confirmation-stale" });
    expect(await folderExists("scratch")).toBe(true);
  });

  it("refuses a deletion that carries no checked tree", async () => {
    const app = makeApp();
    await writeSkill("scratch", "never proposed");

    const response = await remove(app, { name: "scratch" });

    expect(response.status).toBe(400);
    expect(await folderExists("scratch")).toBe(true);
  });
});
