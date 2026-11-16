// Create pull request for the operator's categories over a real clone and a
// bare remote; GitHub is stubbed at the port.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CategoriesProposalRow } from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  git,
  type HarnessStagesApp,
  request,
  rowsOf,
  useHarnessStages,
} from "../helpers/harness-stages";
import { proposeCategories } from "../helpers/propose-categories";

const BRANCH = "refs/heads/maestro/list.categories";

describe("the categories pull request on a real Harness", {
  timeout: 40_000,
}, () => {
  const h = useHarnessStages();

  const post = (app: HarnessStagesApp, path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const ownList = async (app: HarnessStagesApp) => {
    await post(app, "/api/categories", { name: "Planning" });
    await post(app, "/api/categories/assign", {
      items: [{ type: "skill", name: "tdd" }],
      category: "Planning",
    });
  };

  const onRemote = async (...args: string[]) =>
    (await git(h.remote, ...args)).stdout.trim();

  it("pushes the file on its own branch, one commit on the default-branch tip", async () => {
    const app = h.makeApp();
    await ownList(app);
    const tip = await onRemote("rev-parse", "refs/heads/main");

    const res = await proposeCategories(app);

    expect(res.status).toBe(200);
    expect(await onRemote("rev-parse", `${BRANCH}^@`)).toBe(tip);
    expect(await onRemote("show", `${BRANCH}:.maestro/categories.yml`)).toBe(
      [
        "version: 1",
        "categories:",
        "  - Planning",
        "assignments:",
        "  - type: skill",
        "    name: tdd",
        "    category: Planning",
      ].join("\n"),
    );
    // Only the file differs from the tip.
    expect(await onRemote("diff", "--name-only", tip, BRANCH)).toBe(
      ".maestro/categories.yml",
    );
    expect(h.review.created).toMatchObject([
      { head: "maestro/list.categories", base: "main" },
    ]);
  });

  it("builds the file from the config, never from the clone's working tree", async () => {
    const app = h.makeApp();
    await ownList(app);
    await writeFile(
      join(h.root, "apm.yml"),
      "name: changed-in-the-clone\n",
      "utf8",
    );

    await proposeCategories(app);

    expect(await onRemote("show", `${BRANCH}:apm.yml`)).toBe(
      "name: agent-harness",
    );
  });

  it("is a branch no skill or prompt read picks up", async () => {
    const app = h.makeApp();
    await ownList(app);
    await proposeCategories(app);

    const state = await h.refresh(app);

    expect(
      [
        ...rowsOf(state.stages.proposal),
        ...rowsOf(state.stages.review),
        ...rowsOf(state.stages.release),
      ]
        .filter((row) => row.type !== "categories")
        .map((row) => row.name),
    ).toEqual([]);
  });

  it("reads the pushed branch as the Categories row under Pending review", async () => {
    const app = h.makeApp();
    await ownList(app);
    await proposeCategories(app);

    const state = await h.refresh(app);

    expect(rowsOf(state.stages.proposal)).toEqual([]);
    expect(
      rowsOf(state.stages.review).map(
        ({ type, change, status, ownsBranch }) => ({
          type,
          change,
          status,
          ownsBranch,
        }),
      ),
    ).toEqual([
      {
        type: "categories",
        change: "addition",
        status: "pull-request-missing",
        ownsBranch: true,
      },
    ]);
  });

  it("adds a second parent where the branch lacks the default-branch tip", async () => {
    const app = h.makeApp();
    await ownList(app);
    await proposeCategories(app);
    const first = await onRemote("rev-parse", BRANCH);
    // A teammate's merge lands on the default branch after the push.
    await writeFile(join(h.root, "README.md"), "# harness\n", "utf8");
    await git(h.root, "add", "README.md");
    await git(h.root, "commit", "-m", "readme");
    await git(h.root, "push", "origin", "HEAD:main");
    const tip = await onRemote("rev-parse", "refs/heads/main");
    await post(app, "/api/categories", { name: "Writing" });

    const res = await proposeCategories(app);

    expect(res.status).toBe(200);
    expect((await onRemote("rev-parse", `${BRANCH}^@`)).split("\n")).toEqual([
      first,
      tip,
    ]);
    expect(await onRemote("diff", "--name-only", tip, BRANCH)).toBe(
      ".maestro/categories.yml",
    );
  });

  it("compares with the open pull request's branch, then adds one commit to it", async () => {
    const app = h.makeApp();
    await ownList(app);
    await proposeCategories(app);
    const first = await onRemote("rev-parse", BRANCH);
    h.review.answer({
      outcome: "read",
      requests: [
        request({ headBranch: "maestro/list.categories", headCommit: first }),
      ],
      complete: true,
      limit: 100,
    });
    const listOf = async () => {
      // The route answers the core row type as JSON.
      const row = (await (
        await app.request("/api/categories/proposal")
      ).json()) as CategoriesProposalRow;
      return row.state === "own-open" ? row.list : row.state;
    };
    const same = await listOf();
    await post(app, "/api/categories", { name: "Writing" });
    const differs = await listOf();

    const res = await proposeCategories(app);

    expect([same, differs]).toEqual(["same", "differs"]);
    expect(await res.json()).toMatchObject({
      pullRequest: { state: "updated", number: 45 },
    });
    expect(await onRemote("rev-parse", `${BRANCH}^@`)).toBe(first);
    expect(
      await onRemote("show", `${BRANCH}:.maestro/categories.yml`),
    ).toContain("  - Writing");
    expect(await listOf()).toBe("same");
  });
});
