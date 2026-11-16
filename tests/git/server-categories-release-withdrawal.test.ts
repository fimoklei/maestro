// Withdraw from release on the Categories row over a real clone and a bare
// remote; GitHub is stubbed at the port. The withdrawal commit, the clone's
// working tree after it, catch-up, and a new pull request afterwards.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  git,
  type HarnessStagesApp,
  request,
  rowsOf,
  useHarnessStages,
} from "../helpers/harness-stages";
import { proposeCategories } from "../helpers/propose-categories";

const NAME = "maestro/list.categories";
const BRANCH = `refs/heads/${NAME}`;
const FILE = ".maestro/categories.yml";

describe("Withdraw from release on the Categories row of a real Harness", {
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
    // The machine's global ignore rules must not hide an untracked file.
    await git(h.root, "config", "core.excludesFile", "/dev/null");
  });

  const post = async (app: HarnessStagesApp, path: string, body: unknown) => {
    const res = await app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json()) as unknown };
  };

  const onRemote = async (...args: string[]) =>
    (await git(h.remote, ...args)).stdout.trim();

  const mainFile = async () =>
    git(h.remote, "show", `refs/heads/main:${FILE}`).then(
      ({ stdout }) => stdout,
      () => null,
    );

  const cloneFile = () =>
    readFile(join(h.root, FILE), "utf8").catch(() => null);

  const cloneStatus = async () =>
    (
      await git(h.root, "status", "--porcelain", "--untracked-files=all")
    ).stdout.trim();

  // GitHub's merge of the categories branch into main, in the second clone.
  const mergeOnGitHub = async () => {
    await git(github, "fetch", "origin");
    await git(github, "checkout", "-B", "main", "origin/main");
    await git(github, "merge", "--no-ff", "-m", "Merge", `origin/${NAME}`);
    await git(github, "push", "origin", "main");
  };

  // The operator's list `names`, proposed, merged and caught up in the clone.
  const mergedList = async (app: HarnessStagesApp, names: string[]) => {
    for (const name of names) {
      await post(app, "/api/categories", { name });
    }
    expect((await proposeCategories(app)).status).toBe(200);
    const head = await onRemote("rev-parse", BRANCH);
    await mergeOnGitHub();
    h.answer([
      request({
        number: 45,
        url: "https://github.com/fimoklei/agent-harness/pull/45",
        state: "merged",
        headBranch: NAME,
        headCommit: head,
      }),
    ]);
    await h.refresh(app);
    expect(await cloneFile()).toBe(await mainFile());
  };

  const withdraw = async (app: HarnessStagesApp) => {
    const checked = await post(app, "/api/harness/release/withdraw/check", {
      type: "categories",
    });
    expect(checked.status).toBe(200);
    return post(app, "/api/harness/release/withdraw", {
      type: "categories",
      confirmation: (checked.body as { confirmation: string }).confirmation,
    });
  };

  // A release v0.2.0 whose categories file is `text`, cut on GitHub.
  const releasedWith = async (text: string) => {
    await git(github, "fetch", "origin");
    await git(github, "checkout", "-B", "main", "origin/main");
    await mkdir(join(github, ".maestro"), { recursive: true });
    await writeFile(join(github, FILE), text, "utf8");
    await git(github, "add", FILE);
    await git(github, "commit", "-m", "Set Harness categories");
    await git(github, "tag", "v0.2.0");
    await git(github, "push", "--tags", "origin", "main");
  };

  describe("the withdrawal commit and the clone", () => {
    it("removes the file the latest release lacks, on main and in the clone, and catch-up runs afterwards", async () => {
      const app = h.makeApp();
      await mergedList(app, ["Planning"]);

      const pressed = await withdraw(app);

      expect(pressed).toEqual({ status: 200, body: { name: "categories" } });
      expect(await mainFile()).toBeNull();
      expect(await cloneFile()).toBeNull();
      expect(await cloneStatus()).toBe("");
      // A teammate's change lands; the clone follows it.
      await git(github, "pull", "-q", "origin", "main");
      await writeFile(join(github, "apm.yml"), "name: agent-harness-2\n");
      await git(github, "commit", "-qam", "teammate");
      await git(github, "push", "origin", "main");
      const after = await h.refresh(app);
      expect((await git(h.root, "rev-parse", "HEAD")).stdout.trim()).toBe(
        await onRemote("rev-parse", "refs/heads/main"),
      );
      expect(rowsOf(after.stages.release)).toEqual([]);
    });

    it("sets a changed file back to the released one, on main and in the clone", async () => {
      const released =
        "version: 1\ncategories:\n  - Writing\nassignments: []\n";
      await releasedWith(released);
      const app = h.makeApp();
      await h.refresh(app);
      await mergedList(app, ["Planning"]);

      await withdraw(app);

      expect(await mainFile()).toBe(released);
      expect(await cloneFile()).toBe(released);
      expect(await cloneStatus()).toBe("");
    });

    it("leaves a clone file that differs from the withdrawn one", async () => {
      const app = h.makeApp();
      await mergedList(app, ["Planning"]);
      await writeFile(join(h.root, FILE), "edited by hand\n", "utf8");

      await withdraw(app);

      expect(await mainFile()).toBeNull();
      expect(await cloneFile()).toBe("edited by hand\n");
    });
  });

  describe("a new pull request after the withdrawal", () => {
    // What the pull request shows: the change from the merge base.
    const shownChange = async () => {
      const base = await onRemote("merge-base", "refs/heads/main", BRANCH);
      return onRemote("diff", "--name-only", base, BRANCH);
    };

    it.each([
      ["the same list", [] as string[], "  - Planning"],
      ["another list", ["Writing"], "  - Writing"],
    ])(
      "shows the whole change and merges clean with %s",
      async (_, more, expected) => {
        const app = h.makeApp();
        await mergedList(app, ["Planning"]);
        await withdraw(app);
        await h.refresh(app);
        for (const name of more) {
          await post(app, "/api/categories", { name });
        }

        const created = await proposeCategories(app);
        const shown = await shownChange();
        await mergeOnGitHub();

        expect(created.status).toBe(200);
        expect(shown).toBe(FILE);
        expect(await mainFile()).toContain(expected);
      },
    );
  });
});
