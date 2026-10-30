// Withdraw from release pushes one commit to the default branch that puts the
// latest release's copy back, through the routes and the real git adapter
// (#1729). The Working Harness keeps the author's copy.
import { readFile, rm } from "node:fs/promises";
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
    expect(body).toEqual({ confirmation: expect.any(String) });
    return (body as { confirmation: string }).confirmation;
  };

  const skillText = () =>
    readFile(join(stages.root, ".apm", "skills", "tdd", "SKILL.md"), "utf8");

  const remoteSkill = async () =>
    (await git(stages.remote, "show", "main:.apm/skills/tdd/SKILL.md")).stdout;

  it("takes the item out of the next release, and it waits under Pending proposal", async () => {
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
    const confirmation = await confirmationOf(check);

    const response = await post(app, "/api/harness/release/withdraw", {
      name: "tdd",
      confirmation,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: "tdd" });
    expect(await remoteSkill()).toContain("as published");
    expect(await skillText()).toContain("merged after the release");
    const after = await refresh(app);
    expect(
      rowsOf(after.stages.proposal).map((row) => [row.name, row.status]),
    ).toEqual([["tdd", "not-yet-proposed"]]);
    expect(rowsOf(after.stages.release)).toEqual([]);
  });

  const mergeToMain = async (change: () => Promise<unknown>) => {
    await change();
    await git(stages.root, "add", "-A");
    await git(stages.root, "commit", "-m", "merged change");
    await git(stages.root, "push", "origin", "HEAD:main");
  };

  it.each([
    {
      change: "an added",
      merge: () => writeSkill("grill", "a new skill"),
      withdraw: "grill",
      selected: "grill",
      pending: [["grill", "not-yet-proposed"]],
    },
    {
      change: "a deleted",
      merge: () =>
        rm(join(stages.root, ".apm", "skills", "tdd"), { recursive: true }),
      withdraw: "tdd",
      selected: "tdd",
      pending: [["tdd", "not-yet-proposed"]],
    },
    {
      change: "a renamed",
      merge: () =>
        git(stages.root, "mv", ".apm/skills/tdd", ".apm/skills/testing"),
      withdraw: "testing",
      selected: "tdd",
      pending: [
        ["tdd", "not-yet-proposed"],
        ["testing", "not-yet-proposed"],
      ],
    },
  ])(
    "moves $change item from Pending release to Pending proposal",
    async ({ merge, withdraw, selected, pending }) => {
      const app = makeApp();
      await mergeToMain(merge);
      await refresh(app);
      const confirmation = await confirmationOf(
        await post(app, "/api/harness/release/withdraw/check", {
          name: withdraw,
        }),
      );

      const response = await post(app, "/api/harness/release/withdraw", {
        name: withdraw,
        confirmation,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ name: selected });
      const after = await refresh(app);
      expect(
        rowsOf(after.stages.proposal)
          .map((row) => [row.name, row.status])
          .sort(),
      ).toEqual(pending);
      expect(rowsOf(after.stages.release)).toEqual([]);
    },
  );

  it("keeps a withdrawn item under Pending proposal while its merged branch is left on GitHub", async () => {
    const app = makeApp();
    await writeSkill("tdd", "merged after the release");
    await refresh(app);
    expect((await stages.promote(app, "tdd")).status).toBe(200);
    // A squash merge: the default branch holds the branch's content in a
    // commit of its own, and the branch stays on GitHub.
    await mergeEdit();
    await refresh(app);
    const confirmation = await confirmationOf(
      await post(app, "/api/harness/release/withdraw/check", { name: "tdd" }),
    );
    const response = await post(app, "/api/harness/release/withdraw", {
      name: "tdd",
      confirmation,
    });
    expect(response.status).toBe(200);

    stages.review.answer({ outcome: "unavailable", reason: "no-gh" });
    const after = await refresh(app);

    expect(
      rowsOf(after.stages.proposal).map((row) => [row.name, row.status]),
    ).toEqual([["tdd", "not-yet-proposed"]]);
    expect(rowsOf(after.stages.release)).toEqual([]);
  });

  it("refuses once the default branch moved after the confirmation", async () => {
    const app = makeApp();
    await mergeEdit();
    await refresh(app);
    const confirmation = await confirmationOf(
      await post(app, "/api/harness/release/withdraw/check", { name: "tdd" }),
    );
    await writeSkill("grill", "a teammate's skill");
    await git(stages.root, "add", ".");
    await git(stages.root, "commit", "-m", "teammate");
    await git(stages.root, "push", "origin", "HEAD:main");
    await refresh(app);

    const response = await post(app, "/api/harness/release/withdraw", {
      name: "tdd",
      confirmation,
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "confirmation-stale" });
    expect(await remoteSkill()).toContain("merged after the release");
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
