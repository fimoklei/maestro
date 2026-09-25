import { rm } from "node:fs/promises";
import { join } from "node:path";
import { HarnessGitAdapter } from "@maestro/core";
import { describe, expect, it } from "vitest";
import {
  git,
  request,
  rowsOf,
  useHarnessStages,
} from "../helpers/harness-stages";

describe("harness stages over HTTP", { timeout: 40_000 }, () => {
  const stages = useHarnessStages();
  const { writeSkill, makeApp, refresh, read, promote } = stages;

  it("carries a skill through proposal, review and release as three separate rows", async () => {
    // Local edit → prepared proposal → an open request → a further local edit,
    // with the first change already merged: one skill, three pieces of work.
    const app = makeApp();
    await writeSkill("tdd", "first change");
    await promote(app, "tdd");
    stages.review.answer({
      outcome: "read",
      requests: [request()],
      complete: true,
      limit: 100,
    });
    // The reviewer merges the proposal in the fixture's own remote.
    await git(
      stages.remote,
      "update-ref",
      "refs/heads/main",
      "refs/heads/maestro/tdd",
    );
    // …and the author keeps editing afterwards.
    await writeSkill("tdd", "second change");

    const state = await refresh(app);

    expect(rowsOf(state.stages.proposal)).toMatchObject([
      { skill: "tdd", status: "new-local-work" },
    ]);
    expect(rowsOf(state.stages.review)).toMatchObject([
      { skill: "tdd", status: "waiting-for-review" },
    ]);
    expect(rowsOf(state.stages.release)).toMatchObject([
      { skill: "tdd", status: "changed" },
    ]);
    // The new local work follows the open request, so it links to it too.
    expect(rowsOf(state.stages.proposal)[0]?.requests).toEqual([
      {
        number: 45,
        url: "https://github.com/fimoklei/agent-harness/pull/45",
        headBranch: "maestro/tdd",
        baseBranch: "main",
      },
    ]);
    // Every row names the other two, in journey order.
    expect(rowsOf(state.stages.proposal)[0]?.alsoIn).toEqual([
      "pending-review",
      "pending-release",
    ]);
  });

  it("clears a carried-back change from Pending proposal once its proposal merges", async () => {
    // #978: the change stays uncommitted in the clone after Propose change,
    // and merging it on GitHub moved nothing locally.
    const app = makeApp();
    await writeSkill("tdd", "carried back");
    await promote(app, "tdd");
    await git(
      stages.remote,
      "update-ref",
      "refs/heads/main",
      "refs/heads/maestro/tdd",
    );

    const state = await refresh(app);

    expect(rowsOf(state.stages.proposal)).toEqual([]);
    expect(state.cloneSync).toBe("current");
    expect((await git(stages.root, "status", "--porcelain")).stdout).toBe("");
    expect((await git(stages.root, "rev-parse", "HEAD")).stdout).toBe(
      (await git(stages.root, "rev-parse", "origin/main")).stdout,
    );
  });

  it("keeps the pull-request URL and branches across a fresh read, never in the browser", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    stages.review.answer({
      outcome: "read",
      requests: [request()],
      complete: true,
      limit: 100,
    });
    await refresh(app);

    // A second client, with nothing carried over from the first.
    const again = await read(makeApp());

    expect(rowsOf(again.stages.review)).toMatchObject([
      {
        skill: "tdd",
        requests: [
          {
            number: 45,
            url: "https://github.com/fimoklei/agent-harness/pull/45",
            headBranch: "maestro/tdd",
            baseBranch: "main",
          },
        ],
      },
    ]);
  });

  it("never reads a pushed branch alone as an open review", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      { skill: "tdd", status: "pull-request-missing", requests: [] },
    ]);
  });

  it("reads a closed proposal whose content never merged as recoverable", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    stages.review.answer({
      outcome: "read",
      requests: [request({ state: "closed" })],
      complete: true,
      limit: 100,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      { skill: "tdd", status: "proposal-closed" },
    ]);
  });

  it("exposes every matching request instead of choosing one", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    stages.review.answer({
      outcome: "read",
      requests: [
        request({
          number: 41,
          url: "https://github.com/fimoklei/agent-harness/pull/41",
        }),
        request({
          number: 44,
          url: "https://github.com/fimoklei/agent-harness/pull/44",
        }),
      ],
      complete: true,
      limit: 100,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      {
        status: "multiple-pull-requests",
        requests: [{ number: 41 }, { number: 44 }],
      },
    ]);
  });

  it("puts a draft ahead of a requested change, and names the reviewers", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    stages.review.answer({
      outcome: "read",
      requests: [
        request({
          draft: true,
          decision: "changes-requested",
          reviewers: [
            { kind: "user", login: "ada" },
            { kind: "team", slug: "fimoklei/reviewers" },
          ],
        }),
      ],
      complete: true,
      limit: 100,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      {
        status: "draft",
        reviewers: [
          { kind: "user", login: "ada" },
          { kind: "team", slug: "fimoklei/reviewers" },
        ],
      },
    ]);
  });

  it("never matches a request opened from a foreign head or into another base", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    await promote(app, "tdd");
    stages.review.answer({
      outcome: "read",
      requests: [
        request({ headOwner: "someone-else" }),
        request({ number: 46, baseBranch: "release" }),
      ],
      complete: true,
      limit: 100,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.review)).toMatchObject([
      { status: "pull-request-missing", requests: [] },
    ]);
  });

  it("leaves the git stages readable when GitHub cannot be asked", async () => {
    const app = makeApp();
    await writeSkill("tdd", "edited on disk");
    stages.review.answer({ outcome: "unavailable" });

    const state = await refresh(app);

    expect(rowsOf(state.stages.proposal)).toMatchObject([
      { skill: "tdd", status: "not-yet-proposed" },
    ]);
    expect(state.stages.review).toEqual({ outcome: "unavailable" });
    expect(state.stages.release.outcome).toBe("read");
    // Membership is unknown, so no row claims to be the only one.
    expect(rowsOf(state.stages.proposal)[0]?.alsoIn).toBeNull();
  });

  it("keeps a local deletion out of another stage's reading", async () => {
    const app = makeApp();
    // A change that merged, and then the author deletes the skill locally.
    await writeSkill("tdd", "merged change");
    await git(stages.root, "add", ".");
    await git(stages.root, "commit", "-m", "second");
    await git(stages.root, "push", "origin", "HEAD:main");
    await new HarnessGitAdapter().fetch(stages.root);
    await rm(join(stages.root, ".apm", "skills", "tdd"), {
      recursive: true,
      force: true,
    });

    const state = await refresh(app);

    expect(rowsOf(state.stages.proposal)).toMatchObject([
      { skill: "tdd", status: "deleted-locally", deletion: true },
    ]);
    expect(rowsOf(state.stages.release)).toMatchObject([
      { skill: "tdd", status: "changed", deletion: false },
    ]);
  });

  it("asks GitHub once per read, about the Harness's own repository", async () => {
    await refresh(makeApp());

    expect(stages.review.asked).toEqual(["fimoklei/agent-harness"]);
  });
});
