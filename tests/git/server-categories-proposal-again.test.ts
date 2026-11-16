// Proposing the categories again after a close or a merge, over a real clone
// and a bare remote that refuses every force push; GitHub is stubbed at the
// port.
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  git,
  type HarnessStagesApp,
  request,
  rowsOf,
  useHarnessStages,
} from "../helpers/harness-stages";

const NAME = "maestro/list.categories";
const BRANCH = `refs/heads/${NAME}`;
const FILE = ".maestro/categories.yml";

describe("proposing the categories again on a real Harness", {
  timeout: 60_000,
}, () => {
  const h = useHarnessStages();
  // A second clone where GitHub's merges and a teammate's pushes happen.
  let github = "";

  beforeEach(async () => {
    await git(h.remote, "config", "receive.denyNonFastForwards", "true");
    github = join(h.base, "github");
    await git(h.base, "clone", h.remote, github);
    await git(github, "config", "user.email", "mira@example.com");
    await git(github, "config", "user.name", "Mira");
  });

  const post = (app: HarnessStagesApp, path: string, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const name = (app: HarnessStagesApp, category: string) =>
    post(app, "/api/categories", { name: category });

  const onRemote = async (...args: string[]) =>
    (await git(h.remote, ...args)).stdout.trim();

  const create = async (app: HarnessStagesApp) => {
    const res = await post(app, "/api/categories/proposal", {});
    expect(res.status).toBe(200);
    return onRemote("rev-parse", BRANCH);
  };

  const ended = (
    number: number,
    state: "closed" | "merged",
    headCommit: string,
    author = "fimoklei",
  ) =>
    h.answer([
      request({
        number,
        url: `https://github.com/fimoklei/agent-harness/pull/${number}`,
        state,
        headBranch: NAME,
        headCommit,
        author,
      }),
    ]);

  // GitHub's merge of the branch into main, in the second clone.
  const mergeOnGitHub = async () => {
    await git(github, "fetch", "origin");
    await git(github, "checkout", "-B", "main", "origin/main");
    await git(github, "merge", "--no-ff", "-m", "Merge", `origin/${NAME}`);
    await git(github, "push", "origin", "main");
  };

  // What the pull request shows: the change from the merge base, as GitHub
  // compares a branch with its base.
  const shownChange = async () => {
    const base = await onRemote("merge-base", "refs/heads/main", BRANCH);
    return onRemote("diff", "--name-only", base, BRANCH);
  };

  const fileOnMainAfterMerge = async () => {
    await mergeOnGitHub();
    return onRemote("show", `refs/heads/main:${FILE}`);
  };

  const settingsRow = async (app: HarnessStagesApp) =>
    (await app.request("/api/categories/proposal")).json();

  describe("after a close without merging", () => {
    it("deletes the operator's own branch, pushes a new one from the tip and opens a new pull request", async () => {
      const app = h.makeApp();
      await name(app, "Planning");
      const old = await create(app);
      ended(45, "closed", old);
      await name(app, "Writing");
      const preview = await (
        await app.request("/api/categories/proposal/preview")
      ).json();

      const fresh = await create(app);

      expect(preview).toMatchObject({
        kind: "after-close",
        number: 45,
        deletesBranch: true,
      });
      expect(await onRemote("rev-parse", `${BRANCH}^@`)).toBe(
        await onRemote("rev-parse", "refs/heads/main"),
      );
      expect(fresh).not.toBe(old);
      expect(h.review.created).toHaveLength(2);
      expect(h.review.reopened).toEqual([]);
      expect(await shownChange()).toBe(FILE);
    });

    it("stacks a commit where the branch holds another author's commit", async () => {
      const app = h.makeApp();
      await name(app, "Planning");
      await create(app);
      // A teammate's commit lands on the shared branch.
      await git(github, "fetch", "origin");
      await git(github, "checkout", "-B", NAME, `origin/${NAME}`);
      await git(github, "commit", "--allow-empty", "-m", "teammate");
      await git(github, "push", "origin", NAME);
      const theirs = await onRemote("rev-parse", BRANCH);
      ended(46, "closed", theirs, "mira");
      await name(app, "Writing");

      await create(app);

      expect(await onRemote("rev-parse", `${BRANCH}^@`)).toBe(theirs);
      expect(h.review.created).toHaveLength(2);
      expect(await onRemote("show", `${BRANCH}:${FILE}`)).toContain(
        "  - Writing",
      );
    });

    it("reads a closed pull request whose branch was deleted as no proposal, and creates a new one", async () => {
      const app = h.makeApp();
      await name(app, "Planning");
      const old = await create(app);
      ended(45, "closed", old);
      await git(github, "push", "origin", "--delete", NAME);

      const state = await h.refresh(app);
      const row = await settingsRow(app);
      await create(app);

      expect(
        rowsOf(state.stages.review).filter(
          (each) => each.type === "categories",
        ),
      ).toEqual([]);
      expect(row).toEqual({ state: "start" });
      expect(await onRemote("rev-parse", `${BRANCH}^@`)).toBe(
        await onRemote("rev-parse", "refs/heads/main"),
      );
    });
  });

  describe("after a merge", () => {
    it("shows the whole change and merges clean with another list", async () => {
      const app = h.makeApp();
      await name(app, "Planning");
      const first = await create(app);
      await mergeOnGitHub();
      ended(45, "merged", first);
      await name(app, "Writing");

      await create(app);

      expect(await shownChange()).toBe(FILE);
      expect(await fileOnMainAfterMerge()).toContain("  - Writing");
    });

    it("shows the whole change and merges clean with the same list after the file was withdrawn", async () => {
      const app = h.makeApp();
      await name(app, "Planning");
      const first = await create(app);
      await mergeOnGitHub();
      ended(45, "merged", first);
      // Withdraw from release: the default branch drops the file again.
      await git(github, "rm", "-q", FILE);
      await git(github, "commit", "-m", "Withdraw Harness categories");
      await git(github, "push", "origin", "main");
      const proposed = await onRemote("show", `${first}:${FILE}`);

      await create(app);

      expect(await onRemote("show", `${BRANCH}:${FILE}`)).toBe(proposed);
      expect(await shownChange()).toBe(FILE);
      expect(await fileOnMainAfterMerge()).toBe(proposed);
    });
  });
});
