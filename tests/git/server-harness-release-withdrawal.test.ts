// Withdraw from release puts the latest release's copy back in the Working
// Harness, through the routes and the real git adapter (#1687).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  git,
  type HarnessStagesApp,
  rowsOf,
  useHarnessStages,
} from "../helpers/harness-stages";

describe("Withdraw from release over HTTP", { timeout: 40_000 }, () => {
  const stages = useHarnessStages();
  const { writeSkill, makeApp, refresh } = stages;

  const post = (app: HarnessStagesApp, path: string, body: object) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "skill", ...body }),
    });

  const mergeEdit = async () => {
    await writeSkill("tdd", "merged after the release");
    await git(stages.root, "add", ".");
    await git(stages.root, "commit", "-m", "edit tdd");
    await git(stages.root, "push", "origin", "HEAD:main");
  };

  // The assertion checks the shape, so the cast after it states what it proved.
  const confirmationOf = async (check: Response) => {
    const body: unknown = await check.json();
    expect(body).toEqual({
      files: expect.any(Array),
      confirmation: expect.any(String),
    });
    return body as { files: string[]; confirmation: string };
  };

  const skillText = () =>
    readFile(join(stages.root, ".apm", "skills", "tdd", "SKILL.md"), "utf8");

  it("puts the released copy back, and the item waits under Pending proposal", async () => {
    const app = makeApp();
    await mergeEdit();
    const before = await refresh(app);
    expect(rowsOf(before.stages.release).map((row) => row.name)).toEqual([
      "tdd",
    ]);

    const check = await post(app, "/api/harness/release/withdraw/check", {
      name: "tdd",
    });
    expect(check.status).toBe(200);
    const read = await confirmationOf(check);
    expect(read.files).toEqual([]);

    const response = await post(app, "/api/harness/release/withdraw", {
      name: "tdd",
      confirmation: read.confirmation,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "tdd" });
    expect(await skillText()).toContain("as published");
    const after = await refresh(app);
    expect(rowsOf(after.stages.proposal).map((row) => row.name)).toEqual([
      "tdd",
    ]);
    expect(rowsOf(after.stages.release).map((row) => row.name)).toEqual([
      "tdd",
    ]);
  });

  it("lists unproposed files and refuses once the folder changed after the confirmation", async () => {
    const app = makeApp();
    await mergeEdit();
    await refresh(app);
    await writeSkill("tdd", "edited, never proposed");

    const check = await post(app, "/api/harness/release/withdraw/check", {
      name: "tdd",
    });
    const read = await confirmationOf(check);
    expect(read.files).toEqual([".apm/skills/tdd/SKILL.md"]);
    await writeSkill("tdd", "edited again");

    const response = await post(app, "/api/harness/release/withdraw", {
      name: "tdd",
      confirmation: read.confirmation,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "confirmation-stale" });
    expect(await skillText()).toContain("edited again");
  });

  it("refuses an item not under Pending release", async () => {
    const app = makeApp();
    await refresh(app);

    const response = await post(app, "/api/harness/release/withdraw/check", {
      name: "tdd",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "not-pending-release" });
  });
});
